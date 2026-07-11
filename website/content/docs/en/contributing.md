# Contributing

[繁體中文](../contributing.md) · [Documentation home](../README.md)

Thank you for improving Novae. Code, documentation, translation, accessibility, tests, and reproducible bug reports are welcome. Keep repository interaction respectful and focused on technical and user impact. Maintainers may close harassment, discrimination, personal-data disclosure, or unsafe interaction.

## Before opening an issue

Search existing issues and pull requests, reproduce on current `main` or identify the affected commit, redact school/user/credential data, and report security issues through the [private process](security.md#reporting-a-vulnerability).

A bug report should include environment, reproduction steps, expected and actual behavior, a minimal example, and redacted logs. A feature request should explain the user scenario, affected roles, alternatives, privacy impact, and operational cost.

## Development workflow

```bash
git clone https://github.com/<your-account>/novae.git
cd novae
npm ci
git switch -c feat/short-description
```

Follow the [quick start](quick-start.md) and existing architecture boundaries. Database schema changes use new migrations; never edit deployed migrations. Regenerate and commit derived configuration after changing `config/`.

## Pull request expectations

- One clear problem per PR, described in user-visible terms.
- Link the issue and list verification, risks, and recovery.
- Include redacted screenshots for relevant UI changes.
- Update both Traditional Chinese and English docs for behavior or configuration changes.
- Do not commit `.env`, production data, build output, or unrelated formatting.
- Discuss major architectural changes in an issue first.

Before submission:

```bash
npm run verify:local
git diff --check
```

Reviewers assess correctness, architecture, security, compatibility, documentation, and verification. A submission is not guaranteed to merge; duplicate, out-of-scope, unmaintainable, or disproportionate-risk changes may be declined.

Use concise imperative commit subjects. Documentation should favor executable steps, clear tables, and copyable commands. Do not promise unimplemented behavior. Keep both language editions factually aligned.

## License

The project uses the [MIT License](../../LICENSE). By submitting a contribution, you confirm that you have the right to provide it under the same license. Do not submit code, images, or text with unknown, incompatible, or non-redistributable terms.
