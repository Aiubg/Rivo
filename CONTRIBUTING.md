# Contributing to Rivo

Thank you for your interest in contributing to Rivo! We welcome contributions from the community.

## How to Contribute

### Reporting Issues

- Use the [GitHub Issues](https://github.com/your-username/rivo/issues) to report bugs or request features
- Provide detailed information including steps to reproduce, expected behavior, and environment details
- Check existing issues to avoid duplicates

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/rivo.git`
3. Install dependencies: `pnpm install`
4. Set up environment: Copy `.env.example` to `.env.local`
5. Start development: `pnpm dev`

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Add tests for new functionality
4. Run checks: `pnpm check && pnpm test`
5. Format code: `pnpm format`
6. Commit with clear messages

### Pull Request Process

1. Ensure your branch is up to date with main
2. Run all checks and tests
3. Submit a pull request with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots for UI changes
4. Wait for review and address feedback

## Code Guidelines

### TypeScript

- Use strict TypeScript settings
- Avoid `any` types
- Use proper type definitions

### Svelte

- Follow Svelte 5 best practices
- Use reactive statements appropriately
- Keep components focused and reusable

### Styling

- Use Tailwind CSS classes
- Follow the existing design system
- Ensure responsive design

### Testing

- Write unit tests for utilities and components
- Test user interactions
- Maintain test coverage

## Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
