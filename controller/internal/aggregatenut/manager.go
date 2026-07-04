package aggregatenut

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"sort"
	"strings"
	"sync"
	"time"
)

var ErrUnknownUPS = errors.New("unknown ups")

type UPS struct {
	Name        string
	Description string
	Variables   map[string]string
}

type Command struct {
	Name        string
	Description string
}

type Backend interface {
	List(context.Context) ([]UPS, error)
	ListCommands(context.Context, string) ([]Command, error)
	RunCommand(context.Context, string, string) error
}

type Authenticator func(username, password string) bool

// Manager controls lifecycle for the controller-side aggregate NUT TCP listener.
type Manager struct {
	logger *log.Logger

	backend Backend
	auth    Authenticator

	mu       sync.Mutex
	enabled  bool
	listen   string
	listener net.Listener
	stopCh   chan struct{}
}

func NewManager(logger *log.Logger) *Manager {
	return &Manager{logger: logger}
}

func (m *Manager) SetBackend(backend Backend) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.backend = backend
}

func (m *Manager) SetAuthenticator(auth Authenticator) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.auth = auth
}

func (m *Manager) Apply(ctx context.Context, enabled bool, listen string) error {
	listen = strings.TrimSpace(listen)
	if listen == "" {
		listen = ":3493"
	}

	m.mu.Lock()
	prevEnabled := m.enabled
	prevListen := m.listen
	if prevListen == "" {
		prevListen = ":3493"
	}
	needsRestart := prevEnabled != enabled || prevListen != listen
	m.mu.Unlock()
	if !needsRestart {
		return nil
	}

	m.stop()
	if !enabled {
		m.mu.Lock()
		m.enabled = false
		m.listen = listen
		m.mu.Unlock()
		return nil
	}

	if err := m.start(ctx, listen); err != nil {
		return err
	}
	return nil
}

func (m *Manager) Status() (enabled bool, listen string, active bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	enabled = m.enabled
	listen = m.listen
	if strings.TrimSpace(listen) == "" {
		listen = ":3493"
	}
	active = m.listener != nil
	return enabled, listen, active
}

func (m *Manager) Close() {
	m.stop()
}

func (m *Manager) start(ctx context.Context, listen string) error {
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("start aggregate NUT listener on %s: %w", listen, err)
	}
	stopCh := make(chan struct{})

	m.mu.Lock()
	m.enabled = true
	m.listen = ln.Addr().String()
	m.listener = ln
	m.stopCh = stopCh
	m.mu.Unlock()

	go m.serveLoop(ln, stopCh)
	if m.logger != nil {
		m.logger.Printf("aggregate NUT listener enabled listen=%s", listen)
	}

	go func() {
		select {
		case <-ctx.Done():
			m.stop()
		case <-stopCh:
		}
	}()
	return nil
}

func (m *Manager) stop() {
	m.mu.Lock()
	ln := m.listener
	stopCh := m.stopCh
	m.listener = nil
	m.stopCh = nil
	m.enabled = false
	m.mu.Unlock()

	if stopCh != nil {
		close(stopCh)
	}
	if ln != nil {
		_ = ln.Close()
		if m.logger != nil {
			m.logger.Printf("aggregate NUT listener disabled")
		}
	}
}

func (m *Manager) serveLoop(ln net.Listener, stopCh chan struct{}) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-stopCh:
				return
			default:
			}
			if errors.Is(err, net.ErrClosed) {
				return
			}
			if m.logger != nil {
				m.logger.Printf("aggregate NUT listener accept error: %v", err)
			}
			continue
		}
		go m.handleConn(conn)
	}
}

func (m *Manager) handleConn(conn net.Conn) {
	defer conn.Close()

	reader := bufio.NewReader(conn)
	session := nutSession{}
	for {
		_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
		line, err := reader.ReadString('\n')
		if err != nil {
			if !errors.Is(err, io.EOF) && m.logger != nil {
				m.logger.Printf("aggregate NUT read error: %v", err)
			}
			return
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		response, keepOpen := m.handleCommand(context.Background(), &session, line)
		for _, output := range response {
			if _, writeErr := io.WriteString(conn, output+"\n"); writeErr != nil {
				if m.logger != nil {
					m.logger.Printf("aggregate NUT write error: %v", writeErr)
				}
				return
			}
		}
		if !keepOpen {
			return
		}
	}
}

type nutSession struct {
	username string
	authed   bool
}

func (m *Manager) handleCommand(ctx context.Context, session *nutSession, line string) ([]string, bool) {
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return nil, true
	}
	command := strings.ToUpper(parts[0])
	switch command {
	case "QUIT", "LOGOUT":
		return []string{"OK Goodbye"}, false
	case "USERNAME":
		if len(parts) < 2 {
			return []string{"ERR INVALID-ARGUMENT"}, true
		}
		session.username = strings.TrimSpace(parts[1])
		session.authed = false
		return []string{"OK"}, true
	case "PASSWORD":
		if len(parts) < 2 || strings.TrimSpace(session.username) == "" {
			return []string{"ERR ACCESS-DENIED"}, true
		}
		password := strings.TrimSpace(parts[1])
		if !m.authenticate(session.username, password) {
			session.authed = false
			return []string{"ERR ACCESS-DENIED"}, true
		}
		session.authed = true
		return []string{"OK"}, true
	}

	if !session.authed {
		return []string{"ERR ACCESS-DENIED"}, true
	}

	backend, ok := m.getBackend()
	if !ok {
		return []string{"ERR DRIVER-NOT-CONNECTED"}, true
	}

	switch command {
	case "LIST":
		if len(parts) < 2 {
			return []string{"ERR INVALID-ARGUMENT"}, true
		}
		listTarget := strings.ToUpper(parts[1])
		switch listTarget {
		case "UPS":
			if len(parts) != 2 {
				return []string{"ERR INVALID-ARGUMENT"}, true
			}
			upses, err := backend.List(ctx)
			if err != nil {
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			sort.Slice(upses, func(i, j int) bool { return upses[i].Name < upses[j].Name })
			lines := make([]string, 0, len(upses)+2)
			lines = append(lines, "BEGIN LIST UPS")
			for _, ups := range upses {
				description := escapeNUTString(firstNonEmpty(ups.Description, ups.Name))
				lines = append(lines, fmt.Sprintf("UPS %s \"%s\"", ups.Name, description))
			}
			lines = append(lines, "END LIST UPS")
			return lines, true
		case "VAR":
			if len(parts) < 3 {
				return []string{"ERR INVALID-ARGUMENT"}, true
			}
			ups, err := lookupUPS(ctx, backend, parts[2])
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			keys := make([]string, 0, len(ups.Variables))
			for key := range ups.Variables {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			lines := make([]string, 0, len(keys)+2)
			lines = append(lines, fmt.Sprintf("BEGIN LIST VAR %s", ups.Name))
			for _, key := range keys {
				lines = append(lines, fmt.Sprintf("VAR %s %s \"%s\"", ups.Name, key, escapeNUTString(ups.Variables[key])))
			}
			lines = append(lines, fmt.Sprintf("END LIST VAR %s", ups.Name))
			return lines, true
		case "CMD":
			if len(parts) < 3 {
				return []string{"ERR INVALID-ARGUMENT"}, true
			}
			ups, err := lookupUPS(ctx, backend, parts[2])
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			commands, err := backend.ListCommands(ctx, ups.Name)
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			sort.Slice(commands, func(i, j int) bool { return commands[i].Name < commands[j].Name })
			lines := make([]string, 0, len(commands)+2)
			lines = append(lines, fmt.Sprintf("BEGIN LIST CMD %s", ups.Name))
			for _, command := range commands {
				lines = append(lines, fmt.Sprintf("CMD %s %s", ups.Name, command.Name))
			}
			lines = append(lines, fmt.Sprintf("END LIST CMD %s", ups.Name))
			return lines, true
		default:
			return []string{"ERR UNKNOWN-COMMAND"}, true
		}
	case "GET":
		if len(parts) < 4 {
			return []string{"ERR INVALID-ARGUMENT"}, true
		}
		getTarget := strings.ToUpper(parts[1])
		switch getTarget {
		case "VAR":
			ups, err := lookupUPS(ctx, backend, parts[2])
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			variable := parts[3]
			value, ok := ups.Variables[variable]
			if !ok {
				return []string{"ERR VAR-NOT-SUPPORTED"}, true
			}
			return []string{fmt.Sprintf("VAR %s %s \"%s\"", ups.Name, variable, escapeNUTString(value))}, true
		case "CMDDESC":
			if len(parts) < 4 {
				return []string{"ERR INVALID-ARGUMENT"}, true
			}
			ups, err := lookupUPS(ctx, backend, parts[2])
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			commands, err := backend.ListCommands(ctx, ups.Name)
			if err != nil {
				if errors.Is(err, ErrUnknownUPS) {
					return []string{"ERR UNKNOWN-UPS"}, true
				}
				return []string{"ERR DRIVER-NOT-CONNECTED"}, true
			}
			requested := parts[3]
			for _, command := range commands {
				if command.Name == requested {
					return []string{fmt.Sprintf("CMDDESC %s %s \"%s\"", ups.Name, command.Name, escapeNUTString(firstNonEmpty(command.Description, command.Name)))}, true
				}
			}
			return []string{"ERR CMD-NOT-SUPPORTED"}, true
		default:
			return []string{"ERR UNKNOWN-COMMAND"}, true
		}
	case "INSTCMD":
		if len(parts) < 3 {
			return []string{"ERR INVALID-ARGUMENT"}, true
		}
		upsName := parts[1]
		commandName := parts[2]
		if _, err := lookupUPS(ctx, backend, upsName); err != nil {
			if errors.Is(err, ErrUnknownUPS) {
				return []string{"ERR UNKNOWN-UPS"}, true
			}
			return []string{"ERR DRIVER-NOT-CONNECTED"}, true
		}
		if err := backend.RunCommand(ctx, upsName, commandName); err != nil {
			if errors.Is(err, ErrUnknownUPS) {
				return []string{"ERR UNKNOWN-UPS"}, true
			}
			return []string{"ERR FAILED"}, true
		}
		return []string{"OK"}, true
	default:
		return []string{"ERR UNKNOWN-COMMAND"}, true
	}
}

func (m *Manager) getBackend() (Backend, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.backend == nil {
		return nil, false
	}
	return m.backend, true
}

func (m *Manager) authenticate(username, password string) bool {
	m.mu.Lock()
	auth := m.auth
	m.mu.Unlock()
	if auth != nil {
		return auth(strings.TrimSpace(username), strings.TrimSpace(password))
	}
	return strings.TrimSpace(username) != "" && strings.TrimSpace(password) != ""
}

func lookupUPS(ctx context.Context, backend Backend, name string) (UPS, error) {
	upses, err := backend.List(ctx)
	if err != nil {
		return UPS{}, err
	}
	for _, ups := range upses {
		if ups.Name == name {
			return ups, nil
		}
	}
	return UPS{}, ErrUnknownUPS
}

func escapeNUTString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
