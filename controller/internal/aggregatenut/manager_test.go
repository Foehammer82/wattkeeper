package aggregatenut

import (
	"bufio"
	"context"
	"errors"
	"net"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestManagerApplyStartAndStop(t *testing.T) {
	t.Parallel()

	manager := NewManager(nil)
	backend := &fakeBackend{upses: []UPS{{Name: "serial_1234__ups_a", Description: "ups-a on serial-1234", Variables: map[string]string{"ups.status": "OL", "battery.charge": "97"}}}, commands: map[string][]Command{"serial_1234__ups_a": {{Name: "test.battery.start.quick", Description: "Quick self test"}}}}
	manager.SetBackend(backend)
	manager.SetAuthenticator(func(username, password string) bool {
		return username == "controller" && password == "secret"
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := manager.Apply(ctx, true, "127.0.0.1:0"); err != nil {
		t.Fatalf("Apply(start) error = %v", err)
	}
	enabled, listen, active := manager.Status()
	if !enabled || !active || listen == "" {
		t.Fatalf("Status() = enabled=%t listen=%q active=%t, want enabled active with listen", enabled, listen, active)
	}

	conn, err := net.DialTimeout("tcp", listen, 2*time.Second)
	if err != nil {
		t.Fatalf("DialTimeout() error = %v", err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte("LIST UPS\n")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	reader := bufio.NewReader(conn)
	response, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString() error = %v", err)
	}
	if response != "ERR ACCESS-DENIED\n" {
		t.Fatalf("response = %q, want access denied before auth", response)
	}
	if _, err := conn.Write([]byte("USERNAME controller\n")); err != nil {
		t.Fatalf("Write(USERNAME) error = %v", err)
	}
	if response, err = reader.ReadString('\n'); err != nil || response != "OK\n" {
		t.Fatalf("USERNAME response = %q err=%v, want OK", response, err)
	}
	if _, err := conn.Write([]byte("PASSWORD secret\n")); err != nil {
		t.Fatalf("Write(PASSWORD) error = %v", err)
	}
	if response, err = reader.ReadString('\n'); err != nil || response != "OK\n" {
		t.Fatalf("PASSWORD response = %q err=%v, want OK", response, err)
	}

	if _, err := conn.Write([]byte("LIST UPS\n")); err != nil {
		t.Fatalf("Write(LIST UPS) error = %v", err)
	}
	begin, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(begin LIST UPS) error = %v", err)
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(UPS line) error = %v", err)
	}
	end, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(end LIST UPS) error = %v", err)
	}
	if begin != "BEGIN LIST UPS\n" || !strings.HasPrefix(line, "UPS serial_1234__ups_a ") || end != "END LIST UPS\n" {
		t.Fatalf("LIST UPS response = %q%q%q, want begin/ups/end", begin, line, end)
	}

	if _, err := conn.Write([]byte("GET VAR serial_1234__ups_a battery.charge\n")); err != nil {
		t.Fatalf("Write(GET VAR) error = %v", err)
	}
	if response, err = reader.ReadString('\n'); err != nil || response != "VAR serial_1234__ups_a battery.charge \"97\"\n" {
		t.Fatalf("GET VAR response = %q err=%v", response, err)
	}

	if _, err := conn.Write([]byte("LIST CMD serial_1234__ups_a\n")); err != nil {
		t.Fatalf("Write(LIST CMD) error = %v", err)
	}
	begin, err = reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(begin LIST CMD) error = %v", err)
	}
	line, err = reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(CMD line) error = %v", err)
	}
	end, err = reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString(end LIST CMD) error = %v", err)
	}
	if begin != "BEGIN LIST CMD serial_1234__ups_a\n" || line != "CMD serial_1234__ups_a test.battery.start.quick\n" || end != "END LIST CMD serial_1234__ups_a\n" {
		t.Fatalf("LIST CMD response = %q%q%q, want begin/cmd/end", begin, line, end)
	}

	if _, err := conn.Write([]byte("GET CMDDESC serial_1234__ups_a test.battery.start.quick\n")); err != nil {
		t.Fatalf("Write(GET CMDDESC) error = %v", err)
	}
	if response, err = reader.ReadString('\n'); err != nil || response != "CMDDESC serial_1234__ups_a test.battery.start.quick \"Quick self test\"\n" {
		t.Fatalf("GET CMDDESC response = %q err=%v", response, err)
	}

	if _, err := conn.Write([]byte("INSTCMD serial_1234__ups_a test.battery.start.quick\n")); err != nil {
		t.Fatalf("Write(INSTCMD) error = %v", err)
	}
	if response, err = reader.ReadString('\n'); err != nil || response != "OK\n" {
		t.Fatalf("INSTCMD response = %q err=%v, want OK", response, err)
	}
	if backend.lastUPS != "serial_1234__ups_a" || backend.lastCommand != "test.battery.start.quick" {
		t.Fatalf("backend command call = ups=%q cmd=%q, want mapped instcmd call", backend.lastUPS, backend.lastCommand)
	}

	if err := manager.Apply(ctx, false, listen); err != nil {
		t.Fatalf("Apply(stop) error = %v", err)
	}
	enabled, _, active = manager.Status()
	if enabled || active {
		t.Fatalf("Status() after stop = enabled=%t active=%t, want disabled inactive", enabled, active)
	}
}

type fakeBackend struct {
	mu          sync.Mutex
	upses       []UPS
	commands    map[string][]Command
	lastUPS     string
	lastCommand string
	runErr      error
}

func (f *fakeBackend) List(context.Context) ([]UPS, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	cloned := append([]UPS(nil), f.upses...)
	sort.Slice(cloned, func(i, j int) bool { return cloned[i].Name < cloned[j].Name })
	return cloned, nil
}

func (f *fakeBackend) RunCommand(_ context.Context, upsName, command string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUPS = upsName
	f.lastCommand = command
	if f.runErr != nil {
		return f.runErr
	}
	for _, ups := range f.upses {
		if ups.Name == upsName {
			return nil
		}
	}
	return ErrUnknownUPS
}

func (f *fakeBackend) ListCommands(_ context.Context, upsName string) ([]Command, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.commands == nil {
		return nil, nil
	}
	commands, ok := f.commands[upsName]
	if !ok {
		return nil, ErrUnknownUPS
	}
	cloned := append([]Command(nil), commands...)
	sort.Slice(cloned, func(i, j int) bool { return cloned[i].Name < cloned[j].Name })
	return cloned, nil
}

func TestManagerReturnsUnknownUPSForInvalidTarget(t *testing.T) {
	t.Parallel()

	manager := NewManager(nil)
	manager.SetBackend(&fakeBackend{upses: []UPS{{Name: "serial_1234__ups_a", Variables: map[string]string{"ups.status": "OL"}}}})
	manager.SetAuthenticator(func(username, password string) bool { return username == "controller" && password == "secret" })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := manager.Apply(ctx, true, "127.0.0.1:0"); err != nil {
		t.Fatalf("Apply(start) error = %v", err)
	}
	defer manager.Close()
	_, listen, _ := manager.Status()

	conn, err := net.DialTimeout("tcp", listen, 2*time.Second)
	if err != nil {
		t.Fatalf("DialTimeout() error = %v", err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for _, command := range []string{"USERNAME controller\n", "PASSWORD secret\n"} {
		if _, err := conn.Write([]byte(command)); err != nil {
			t.Fatalf("Write(%q) error = %v", strings.TrimSpace(command), err)
		}
		if response, err := reader.ReadString('\n'); err != nil || response != "OK\n" {
			t.Fatalf("auth response = %q err=%v, want OK", response, err)
		}
	}
	if _, err := conn.Write([]byte("GET VAR missing_ups battery.charge\n")); err != nil {
		t.Fatalf("Write(GET VAR missing) error = %v", err)
	}
	response, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString() error = %v", err)
	}
	if response != "ERR UNKNOWN-UPS\n" {
		t.Fatalf("response = %q, want ERR UNKNOWN-UPS", response)
	}
}

func TestManagerInstcmdFailureReturnsErrFailed(t *testing.T) {
	t.Parallel()

	manager := NewManager(nil)
	manager.SetBackend(&fakeBackend{upses: []UPS{{Name: "serial_1234__ups_a", Variables: map[string]string{"ups.status": "OL"}}}, runErr: errors.New("downstream failed")})
	manager.SetAuthenticator(func(username, password string) bool { return username == "controller" && password == "secret" })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := manager.Apply(ctx, true, "127.0.0.1:0"); err != nil {
		t.Fatalf("Apply(start) error = %v", err)
	}
	defer manager.Close()
	_, listen, _ := manager.Status()

	conn, err := net.DialTimeout("tcp", listen, 2*time.Second)
	if err != nil {
		t.Fatalf("DialTimeout() error = %v", err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for _, command := range []string{"USERNAME controller\n", "PASSWORD secret\n"} {
		if _, err := conn.Write([]byte(command)); err != nil {
			t.Fatalf("Write(%q) error = %v", strings.TrimSpace(command), err)
		}
		if response, err := reader.ReadString('\n'); err != nil || response != "OK\n" {
			t.Fatalf("auth response = %q err=%v, want OK", response, err)
		}
	}
	if _, err := conn.Write([]byte("INSTCMD serial_1234__ups_a test.battery.start.quick\n")); err != nil {
		t.Fatalf("Write(INSTCMD) error = %v", err)
	}
	response, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("ReadString() error = %v", err)
	}
	if response != "ERR FAILED\n" {
		t.Fatalf("response = %q, want ERR FAILED", response)
	}
}
