.DEFAULT_GOAL := help
SHELL := bash
.SHELLFLAGS := -euo pipefail -c

# The deployed game (GitHub Pages). Override: make verify VERIFY_URL=http://...
VERIFY_URL ?= https://ideafactory-labs.github.io/sky-hoppers/

.PHONY: help test lint unit e2e serve up down verify evidence

help: ## Show targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

test: lint unit e2e ## Project checks (CI's required gate)

lint: ## Workflow policy + JS syntax
	python3 .factory/check_workflows.py .github/workflows
	for f in site/js/*.js tests/*.js tests/*.mjs; do node --check "$$f"; done

unit: ## Rules + every level beatable by every character (Node, no browser)
	node --test tests/sim.test.js

e2e: ## Headless Chromium checks against a local copy of site/
	node tests/e2e.mjs

serve: ## Play locally at http://127.0.0.1:8000/
	node tests/serve.mjs

up: ## Start paid resources (live workflow only)
	@echo "cloud: none — this project has no paid resources; nothing to start"

down: ## Tear down and prove nothing tagged remains
	@echo "cloud: none — nothing was ever created, so nothing tagged Project=sky-hoppers can remain"

verify: ## The runtime check from the idea's "How we'll know it works", against the deployed page
	BASE_URL="$(VERIFY_URL)" EVIDENCE_DIR=evidence/verify node tests/e2e.mjs

evidence: ## Capture proof for the PR (screenshots, frame time, results) into evidence/
	rm -rf evidence && EVIDENCE_DIR=evidence node tests/e2e.mjs
	@ls -1 evidence
