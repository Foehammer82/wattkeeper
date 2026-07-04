package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/Foehammer82/wattkeeper/agent/internal/nutconf"
)

const (
	defaultCPUTempPath = "/sys/class/thermal/thermal_zone0/temp"
	defaultRootPath    = "/"
	defaultUPSCPath    = "upsc"
	startingStatus     = "starting"
	unknownStatus      = "unknown"
)

type commandRunner interface {
	CombinedOutput(ctx context.Context, path string, args ...string) ([]byte, error)
}

type execRunner struct{}

func (execRunner) CombinedOutput(ctx context.Context, path string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, path, args...).CombinedOutput()
}

type Options struct {
	Version     string
	Serial      string
	StartedAt   time.Time
	Runner      commandRunner
	UPSCPath    string
	CPUTempPath string
	RootPath    string
	DisableAuth bool
	AuthPath    string
}

type Service struct {
	logger      *log.Logger
	version     string
	serial      string
	startedAt   time.Time
	runner      commandRunner
	upscPath    string
	cpuTempPath string
	rootPath    string
	auth        *authManager

	mu      sync.RWMutex
	devices []nutconf.DetectedUPS
	cache   http.Handler
}

type healthResponse struct {
	Version               string      `json:"version"`
	UptimeSeconds         int64       `json:"uptime_seconds"`
	Serial                string      `json:"serial"`
	CPUTemperatureCelsius *float64    `json:"cpu_temperature_celsius,omitempty"`
	DiskFreeBytes         uint64      `json:"disk_free_bytes"`
	UPSes                 []upsHealth `json:"upses"`
}

type statusResponse struct {
	Status   string `json:"status"`
	UPSCount int    `json:"ups_count"`
}

type upsHealth struct {
	Name   string `json:"name"`
	Driver string `json:"driver"`
	Status string `json:"status"`
}

type indexViewModel struct {
	GeneratedAt time.Time
	Health      healthResponse
	AuthEnabled bool
}

var indexTemplate = template.Must(template.New("index").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta http-equiv="refresh" content="15">
	<title>Wattkeeper Node</title>
	<style>
		:root {
			color-scheme: light;
			--bg: #f4efe7;
			--panel: #fffaf2;
			--ink: #1f2933;
			--muted: #5f6c7b;
			--line: #d7c8b3;
			--accent: #0f766e;
			--good: #166534;
			--warn: #b45309;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: "Segoe UI", Tahoma, sans-serif;
			color: var(--ink);
			background: linear-gradient(180deg, #efe7da 0%, var(--bg) 55%, #efe9df 100%);
		}
		main {
			max-width: 980px;
			margin: 0 auto;
			padding: 32px 20px 40px;
		}
		header {
			margin-bottom: 24px;
		}
		h1 {
			margin: 0 0 8px;
			font-size: clamp(2rem, 4vw, 3.2rem);
			line-height: 1;
		}
		p {
			margin: 0;
			color: var(--muted);
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 12px;
			margin-bottom: 20px;
		}
		.card {
			background: rgba(255, 250, 242, 0.9);
			border: 1px solid var(--line);
			border-radius: 16px;
			padding: 16px;
			box-shadow: 0 10px 25px rgba(31, 41, 51, 0.06);
		}
		.label {
			display: block;
			margin-bottom: 6px;
			font-size: 0.78rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--muted);
		}
		.value {
			font-size: 1.35rem;
			font-weight: 600;
		}
		.section-title {
			margin: 24px 0 12px;
			font-size: 1.15rem;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			background: rgba(255, 250, 242, 0.9);
			border: 1px solid var(--line);
			border-radius: 16px;
			overflow: hidden;
			box-shadow: 0 10px 25px rgba(31, 41, 51, 0.06);
		}
		th, td {
			padding: 14px 16px;
			text-align: left;
			border-bottom: 1px solid var(--line);
		}
		th {
			font-size: 0.78rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--muted);
		}
		tr:last-child td { border-bottom: 0; }
		.status {
			font-weight: 600;
			color: var(--good);
		}
		.status-warn {
			color: var(--warn);
		}
		.links {
			margin-top: 16px;
			font-size: 0.95rem;
		}
		.links a {
			color: var(--accent);
			text-decoration: none;
			margin-right: 12px;
		}
		.empty {
			padding: 18px 16px;
			background: rgba(255, 250, 242, 0.9);
			border: 1px dashed var(--line);
			border-radius: 16px;
			color: var(--muted);
		}
	</style>
</head>
<body>
	<main>
		<header>
			<h1>Wattkeeper Node</h1>
			<p>Local node dashboard for NUT-backed UPS monitoring. Refreshes every 15 seconds.</p>
		</header>

		<section class="grid">
			<article class="card">
				<span class="label">Version</span>
				<span class="value">{{.Health.Version}}</span>
			</article>
			<article class="card">
				<span class="label">Serial</span>
				<span class="value">{{if .Health.Serial}}{{.Health.Serial}}{{else}}unknown{{end}}</span>
			</article>
			<article class="card">
				<span class="label">Uptime</span>
				<span class="value">{{.Health.UptimeSeconds}}s</span>
			</article>
			<article class="card">
				<span class="label">Disk Free</span>
				<span class="value">{{.Health.DiskFreeBytes}} B</span>
			</article>
			<article class="card">
				<span class="label">CPU Temp</span>
				<span class="value">{{if .Health.CPUTemperatureCelsius}}{{printf "%.1f C" .Health.CPUTemperatureCelsius}}{{else}}unavailable{{end}}</span>
			</article>
			<article class="card">
				<span class="label">UPS Count</span>
				<span class="value">{{len .Health.UPSes}}</span>
			</article>
		</section>

		<h2 class="section-title">UPS Inventory</h2>
		{{if .Health.UPSes}}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Driver</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{{range .Health.UPSes}}
				<tr>
					<td>{{.Name}}</td>
					<td>{{.Driver}}</td>
					<td class="status {{if or (eq .Status "starting") (eq .Status "unknown")}}status-warn{{end}}">{{.Status}}</td>
				</tr>
				{{end}}
			</tbody>
		</table>
		{{else}}
		<div class="empty">No UPS devices are currently discovered on this node.</div>
		{{end}}

		<div class="links">
			<a href="/status">JSON status</a>
			<a href="/status/details">Detailed JSON</a>
			<a href="/healthz">Health payload</a>
			{{if .AuthEnabled}}<a href="/settings">Settings</a>{{end}}
		</div>
		{{if .AuthEnabled}}
		<form method="post" action="/auth/logout" class="links">
			<button type="submit" style="border:0;background:none;color:var(--accent);padding:0;font:inherit;cursor:pointer;">Sign out</button>
		</form>
		{{end}}
		<p class="links">Last rendered: {{.GeneratedAt.Format "2006-01-02 15:04:05 MST"}}</p>
	</main>
</body>
</html>`))

func New(logger *log.Logger, opts Options) *Service {
	startedAt := opts.StartedAt
	if startedAt.IsZero() {
		startedAt = time.Now()
	}

	runner := opts.Runner
	if runner == nil {
		runner = execRunner{}
	}

	upscPath := opts.UPSCPath
	if upscPath == "" {
		upscPath = defaultUPSCPath
	}

	cpuTempPath := opts.CPUTempPath
	if cpuTempPath == "" {
		cpuTempPath = defaultCPUTempPath
	}

	rootPath := opts.RootPath
	if rootPath == "" {
		rootPath = defaultRootPath
	}

	service := &Service{
		logger:      logger,
		version:     defaultString(opts.Version, "dev"),
		serial:      opts.Serial,
		startedAt:   startedAt,
		runner:      runner,
		upscPath:    upscPath,
		cpuTempPath: cpuTempPath,
		rootPath:    rootPath,
		auth:        newAuthManager(opts.DisableAuth, opts.AuthPath),
	}
	service.cache = service.loggingMiddleware(service.routes())
	return service
}

func (s *Service) Handler() http.Handler {
	return s.cache
}

func (s *Service) UpdateInventory(devices []nutconf.DetectedUPS) {
	cloned := make([]nutconf.DetectedUPS, len(devices))
	copy(cloned, devices)
	sort.Slice(cloned, func(i, j int) bool {
		return cloned[i].Name < cloned[j].Name
	})

	s.mu.Lock()
	s.devices = cloned
	s.mu.Unlock()
}

func (s *Service) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/auth/bootstrap", s.handleBootstrap)
	mux.HandleFunc("/auth/login", s.handleLogin)
	mux.HandleFunc("/auth/logout", s.handleLogout)
	mux.HandleFunc("/auth/reset", s.handleReset)
	mux.HandleFunc("/settings", s.handleSettings)
	mux.HandleFunc("/settings/ui", s.handleUISetting)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/status/details", s.handleStatusDetails)
	mux.HandleFunc("/healthz", s.handleHealthz)
	return mux
}

func (s *Service) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.auth.Enabled() {
		needsBootstrap, err := s.auth.NeedsBootstrap()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if needsBootstrap {
			s.renderBootstrapPage(w, http.StatusOK, "")
			return
		}
		if _, ok := s.requireSession(w, r); !ok {
			return
		}
		uiEnabled, err := s.auth.UIEnabled()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !uiEnabled {
			http.Redirect(w, r, "/settings?message=local-ui-disabled", http.StatusSeeOther)
			return
		}
	}

	response, err := s.buildHealthResponse(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := indexTemplate.Execute(w, indexViewModel{GeneratedAt: time.Now(), Health: response, AuthEnabled: s.auth.Enabled()}); err != nil && s.logger != nil {
		s.logger.Printf("render index failed: %v", err)
	}
}

func (s *Service) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if !s.auth.Enabled() {
		writeJSONError(w, http.StatusNotFound, "bootstrap unavailable when http auth is disabled")
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	req, err := bootstrapRequestFromRequest(r)
	if err != nil {
		if wantsHTML(r) {
			s.renderBootstrapPage(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.auth.Bootstrap(req); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, errAuthAlreadyConfigured):
			status = http.StatusConflict
		case errors.Is(err, errAuthDisabled):
			status = http.StatusNotFound
		default:
			if !strings.Contains(err.Error(), ":") && !strings.Contains(err.Error(), "config") {
				status = http.StatusBadRequest
			}
		}
		if wantsHTML(r) && status == http.StatusBadRequest {
			s.renderBootstrapPage(w, status, err.Error())
			return
		}
		writeJSONError(w, status, err.Error())
		return
	}
	if err := s.startSession(w, strings.TrimSpace(req.Username)); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if wantsHTML(r) {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (s *Service) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.auth.Enabled() {
		writeJSONError(w, http.StatusNotFound, "login unavailable when http auth is disabled")
		return
	}
	if r.Method == http.MethodGet {
		uiEnabled, err := s.auth.UIEnabled()
		if err != nil && !errors.Is(err, errAuthNotConfigured) {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.renderLoginPage(w, http.StatusOK, "", !uiEnabled)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	req, err := loginRequestFromRequest(r)
	if err != nil {
		if wantsHTML(r) {
			s.renderLoginPage(w, http.StatusBadRequest, err.Error(), false)
			return
		}
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateLoginRequest(req); err != nil {
		if wantsHTML(r) {
			s.renderLoginPage(w, http.StatusBadRequest, err.Error(), false)
			return
		}
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.auth.Authenticate(req.Username, req.Password); err != nil {
		if wantsHTML(r) {
			s.renderLoginPage(w, http.StatusUnauthorized, "invalid username or password", false)
			return
		}
		writeJSONError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err := s.startSession(w, strings.TrimSpace(req.Username)); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	uiEnabled, _ := s.auth.UIEnabled()
	if wantsHTML(r) {
		if uiEnabled {
			http.Redirect(w, r, "/", http.StatusSeeOther)
		} else {
			http.Redirect(w, r, "/settings?message=local-ui-disabled", http.StatusSeeOther)
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed-in"})
}

func (s *Service) handleLogout(w http.ResponseWriter, r *http.Request) {
	if !s.auth.Enabled() {
		writeJSONError(w, http.StatusNotFound, "logout unavailable when http auth is disabled")
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		s.auth.ClearSession(cookie.Value)
	}
	s.clearSessionCookie(w)
	if wantsHTML(r) {
		http.Redirect(w, r, "/auth/login", http.StatusSeeOther)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed-out"})
}

func (s *Service) handleReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, ok := s.requireSession(w, r); !ok {
		return
	}
	if err := s.auth.Reset(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.clearSessionCookie(w)
	if wantsHTML(r) {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}

func (s *Service) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	username, ok := s.requireSession(w, r)
	if !ok {
		return
	}
	uiEnabled, err := s.auth.UIEnabled()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.renderSettingsPage(w, http.StatusOK, settingsViewModel{Username: username, UIEnabled: uiEnabled, Message: r.URL.Query().Get("message")})
}

func (s *Service) handleUISetting(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, ok := s.requireSession(w, r); !ok {
		return
	}
	enabled, err := enabledFlagFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.auth.SetUIEnabled(enabled); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	message := "local-ui-enabled"
	if !enabled {
		message = "local-ui-disabled"
	}
	if wantsHTML(r) {
		http.Redirect(w, r, "/settings?message="+message, http.StatusSeeOther)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "updated", "ui_enabled": enabled})
}

func (s *Service) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	response, err := s.buildStatusResponse(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Service) handleStatusDetails(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, ok := s.requireSession(w, r); !ok {
		return
	}

	response, err := s.buildHealthResponse(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Service) handleHealthz(w http.ResponseWriter, r *http.Request) {
	s.handleStatusDetails(w, r)
}

func (s *Service) renderBootstrapPage(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := bootstrapTemplate.Execute(w, bootstrapViewModel{Error: message}); err != nil && s.logger != nil {
		s.logger.Printf("render bootstrap failed: %v", err)
	}
}

func (s *Service) renderLoginPage(w http.ResponseWriter, status int, message string, uiDisabled bool) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := loginTemplate.Execute(w, loginViewModel{Error: message, UIDisabled: uiDisabled}); err != nil && s.logger != nil {
		s.logger.Printf("render login failed: %v", err)
	}
}

func (s *Service) renderSettingsPage(w http.ResponseWriter, status int, viewModel settingsViewModel) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := settingsTemplate.Execute(w, viewModel); err != nil && s.logger != nil {
		s.logger.Printf("render settings failed: %v", err)
	}
}

func (s *Service) requireSession(w http.ResponseWriter, r *http.Request) (string, bool) {
	if !s.auth.Enabled() {
		return "", true
	}
	needsBootstrap, err := s.auth.NeedsBootstrap()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return "", false
	}
	if needsBootstrap {
		if wantsHTML(r) {
			s.renderBootstrapPage(w, http.StatusOK, "")
		} else {
			writeJSONError(w, http.StatusServiceUnavailable, errAuthNotConfigured.Error())
		}
		return "", false
	}
	username, err := s.auth.SessionUsername(r)
	if err != nil {
		if wantsHTML(r) {
			uiDisabled, _ := s.auth.UIEnabled()
			s.renderLoginPage(w, http.StatusUnauthorized, "sign in required", !uiDisabled)
		} else {
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
		}
		return "", false
	}
	return username, true
}

func (s *Service) startSession(w http.ResponseWriter, username string) error {
	token, err := s.auth.CreateSession(username)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   false,
		MaxAge:   int(defaultSessionTTL.Seconds()),
	})
	return nil
}

func (s *Service) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: false, MaxAge: -1})
}

func (s *Service) buildStatusResponse(ctx context.Context) (statusResponse, error) {
	upses := s.buildUPSStatuses(ctx)
	return statusResponse{
		Status:   summarizeStatus(upses),
		UPSCount: len(upses),
	}, nil
}

func (s *Service) buildHealthResponse(ctx context.Context) (healthResponse, error) {
	response := healthResponse{
		Version:       s.version,
		UptimeSeconds: int64(time.Since(s.startedAt).Seconds()),
		Serial:        s.serial,
	}

	if cpuTemp, err := readCPUTemperature(s.cpuTempPath); err == nil {
		response.CPUTemperatureCelsius = cpuTemp
	} else if s.logger != nil {
		s.logger.Printf("health cpu temperature unavailable: %v", err)
	}

	diskFree, err := diskFreeBytes(s.rootPath)
	if err != nil {
		return healthResponse{}, fmt.Errorf("stat root filesystem: %w", err)
	}
	response.DiskFreeBytes = diskFree
	response.UPSes = s.buildUPSStatuses(ctx)

	return response, nil
}
func (s *Service) buildUPSStatuses(ctx context.Context) []upsHealth {
	devices := s.inventory()
	upses := make([]upsHealth, 0, len(devices))
	for _, device := range devices {
		status := unknownStatus
		upsStatus, err := s.queryUPSStatus(ctx, device.Name)
		if err != nil {
			if s.logger != nil {
				s.logger.Printf("health upsc failed ups=%s: %v", device.Name, err)
			}
		} else {
			status = upsStatus
		}

		upses = append(upses, upsHealth{
			Name:   device.Name,
			Driver: device.Driver,
			Status: status,
		})
	}

	return upses
}

func summarizeStatus(upses []upsHealth) string {
	if len(upses) == 0 {
		return "empty"
	}

	for _, device := range upses {
		if device.Status == startingStatus || device.Status == unknownStatus {
			return "degraded"
		}
	}

	return "ok"
}

func (s *Service) queryUPSStatus(ctx context.Context, name string) (string, error) {
	output, err := s.runner.CombinedOutput(ctx, s.upscPath, name)
	status, parseErr := parseUPSStatus(output)
	if parseErr == nil {
		return status, nil
	}
	if err != nil && isDriverStarting(output, err) {
		return startingStatus, nil
	}
	if err != nil {
		return "", fmt.Errorf("run %s %s: %w: %s", s.upscPath, name, err, strings.TrimSpace(string(output)))
	}
	return "", parseErr
}

func (s *Service) inventory() []nutconf.DetectedUPS {
	s.mu.RLock()
	defer s.mu.RUnlock()

	devices := make([]nutconf.DetectedUPS, len(s.devices))
	copy(devices, s.devices)
	return devices
}

func (s *Service) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		if s.logger != nil {
			s.logger.Printf("http method=%s path=%s status=%d duration=%s", r.Method, r.URL.Path, wrapped.status, time.Since(start).Round(time.Millisecond))
		}
	})
}

func readCPUTemperature(path string) (*float64, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	value, err := strconv.ParseFloat(strings.TrimSpace(string(content)), 64)
	if err != nil {
		return nil, fmt.Errorf("parse cpu temperature: %w", err)
	}

	temperature := value / 1000.0
	return &temperature, nil
}

func diskFreeBytes(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}

func parseUPSStatus(output []byte) (string, error) {
	for _, line := range strings.Split(string(output), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			key, value, ok = strings.Cut(trimmed, "=")
		}
		if !ok {
			continue
		}

		if strings.TrimSpace(key) != "ups.status" {
			continue
		}

		status := strings.TrimSpace(value)
		if status == "" {
			break
		}
		return status, nil
	}

	return "", fmt.Errorf("ups.status not found")
}

func isDriverStarting(output []byte, err error) bool {
	combined := strings.ToLower(strings.TrimSpace(string(output)))
	if err != nil {
		combined += " " + strings.ToLower(err.Error())
	}

	for _, marker := range []string{
		"data stale",
		"driver not connected",
		"connection refused",
		"connection failure",
		"initializing",
		"driver is not connected",
	} {
		if strings.Contains(combined, marker) {
			return true
		}
	}

	return false
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func wantsHTML(r *http.Request) bool {
	if strings.Contains(strings.ToLower(r.Header.Get("Accept")), "text/html") {
		return true
	}
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	return strings.HasPrefix(contentType, "application/x-www-form-urlencoded") || strings.HasPrefix(contentType, "multipart/form-data")
}

func bootstrapRequestFromRequest(r *http.Request) (bootstrapRequest, error) {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(contentType, "application/json") {
		var req bootstrapRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return bootstrapRequest{}, fmt.Errorf("decode bootstrap request: %w", err)
		}
		return req, nil
	}
	if err := r.ParseForm(); err != nil {
		return bootstrapRequest{}, fmt.Errorf("parse bootstrap form: %w", err)
	}
	return bootstrapRequest{
		Username:        r.FormValue("username"),
		Password:        r.FormValue("password"),
		ConfirmPassword: r.FormValue("confirm_password"),
	}, nil
}

func loginRequestFromRequest(r *http.Request) (loginRequest, error) {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(contentType, "application/json") {
		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return loginRequest{}, fmt.Errorf("decode login request: %w", err)
		}
		return req, nil
	}
	if err := r.ParseForm(); err != nil {
		return loginRequest{}, fmt.Errorf("parse login form: %w", err)
	}
	return loginRequest{Username: r.FormValue("username"), Password: r.FormValue("password")}, nil
}

func enabledFlagFromRequest(r *http.Request) (bool, error) {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(contentType, "application/json") {
		var payload struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			return false, fmt.Errorf("decode ui setting request: %w", err)
		}
		return payload.Enabled, nil
	}
	if err := r.ParseForm(); err != nil {
		return false, fmt.Errorf("parse ui setting form: %w", err)
	}
	switch strings.ToLower(strings.TrimSpace(r.FormValue("enabled"))) {
	case "true", "1", "yes", "on":
		return true, nil
	case "false", "0", "no", "off":
		return false, nil
	default:
		return false, errors.New("enabled must be true or false")
	}
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
