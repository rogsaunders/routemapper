# RouteMapper

Record a route, generate a professional roadbook, and follow it live.

- **App:** [app.routemapper.net](https://app.routemapper.net) — Record, Review and Travel modes
- **RouteMapper Travel:** [go.routemapper.net](https://go.routemapper.net) — standalone roadbook reader and Route Library
- **Website:** [routemapper.net](https://routemapper.net)

## Documentation

Start with [docs/README.md](docs/README.md). The main documents:

- [Specification](docs/specification.md) — what RouteMapper is and does
- [Architecture](docs/architecture.md) — how it is built
- [Workflow](docs/route-mapper-workflow.md) — using it in the field
- [User Guide](docs/user-guide.md)
- [Development workflow](DEVELOPMENT.md)

## Running locally

```bash
npm install
npm run dev          # editor app on https://localhost:5173
npm run dev:travel   # standalone Travel app on https://localhost:5174
npm run build        # editor → dist/
npm run build:travel # Travel → dist-travel/
npm run lint
```

HTTPS is used locally because geolocation and speech require a secure context. Environment variables are listed in `.env.example`.
