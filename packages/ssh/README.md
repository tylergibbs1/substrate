# @substrate/ssh

Remote-connection helpers, reused pattern from t3code (PRD §9, §6.5). Stub.

Purpose: gate remote MCP access behind an SSH tunnel so an agent on another
machine can edit a deck's prompts. Loopback-only by default; token-gated when
enabled (PRD §13 security).
