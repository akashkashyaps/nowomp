# Security Policy

## Supported versions

Only the latest release receives security fixes.

| Version | Supported |
|---|---|
| 2.0.x | ✅ |
| < 2.0 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Email **developernowomp@gmail.com** with:
- a description of the issue and its impact,
- steps to reproduce it, or a proof of concept,
- the app version and Android version.

You'll get an acknowledgement within a few days. Once a fix is released, you'll be credited in the changelog unless you'd rather not be.

## Scope

NoWomp has no servers and makes no network requests with user data, so most reports will concern:
- the on-device database or exported backup files,
- deep links (`nowomp://`) and the data they can prefill,
- the home-screen widget or notifications exposing data,
- Android permissions and exported components.
