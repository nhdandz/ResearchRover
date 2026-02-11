# Contributing to RRI

Thank you for your interest in contributing to **RRI (Research & Repository Intelligence)**! 🎉

## 🚀 Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/nhdandz/ResearchRover.git
   cd ResearchRover
   ```
3. **Create** a feature branch:
   ```bash
   git checkout -b feature/amazing-feature
   ```
4. **Set up** the development environment:
   ```bash
   cp .env.example .env
   make up
   make migrate
   ```

## 📝 Development Workflow

### Backend (Python)

```bash
# Install dependencies locally
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Run the API server
uvicorn src.main:app --reload --port 8000

# Run linter & formatter
make lint
make format

# Run tests
make test
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

## 🔀 Pull Request Process

1. **Update** documentation if your change affects the public API or CLI
2. **Ensure** your code passes lint checks (`make lint`)
3. **Test** your changes (`make test`)
4. **Commit** with clear messages following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new data source collector
   fix: resolve search pagination issue
   docs: update API reference
   ```
5. **Push** to your fork and open a Pull Request

## 🏗 Project Structure

See [Architecture Documentation](docs/ARCHITECTURE.md) for a detailed breakdown of the codebase.

## 📋 Code Style

- **Python**: Follow [PEP 8](https://peps.python.org/pep-0008/), enforced by [Ruff](https://docs.astral.sh/ruff/)
- **TypeScript**: Follow the existing ESLint configuration
- **Commits**: Use clear, descriptive commit messages

## 🐛 Bug Reports

When filing a bug, please include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Docker version, browser)
- Relevant logs (`make logs`)

## 💡 Feature Requests

We welcome feature ideas! Open an issue with:
- Clear description of the proposed feature
- Use case / motivation
- Any relevant examples or references

## 📄 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
