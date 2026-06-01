# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in the Lead Protocol, please report it responsibly.

**Do not open a public issue.** Instead, email [gh@mmilanez.com](mailto:gh@mmilanez.com) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Scope

This policy applies to the Lead Protocol scaffold, JSON Schemas, documentation, validator (`validate_state.py`), migration tool (`migrate_to_v2.py`), and all protocol files in this repository.

The CLI (`lead-protocol` command) and MCP server are planned surfaces — they are not yet shipped and are therefore not in scope until released.

This policy does not cover third-party tools or services that integrate with the protocol.

## Supported versions

| Version | Supported |
|---|---|
| Latest published release | Yes |
| `main` | Development branch — best effort |
| Older releases | Best effort, no backports unless critical |
