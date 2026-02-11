# 🌐 Deployment

## Docker Compose (Recommended)

### Production Deployment

```bash
# Clone the repository
git clone https://github.com/nhdandz/ResearchRover.git
cd ResearchRover

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker compose up -d

# Run database migrations
make migrate

# Pull the LLM model
make pull-model

# (Optional) Seed demo data
make seed
```

This launches **8 containers**:

| Container | Service | Description |
|:----------|:--------|:------------|
| `rri-app-1` | FastAPI | Backend API server |
| `rri-worker-1` | Celery Worker | Background task processing |
| `rri-beat-1` | Celery Beat | Periodic task scheduler |
| `rri-frontend-1` | Next.js | Frontend web application |
| `rri-postgres-1` | PostgreSQL 16 | Relational database |
| `rri-redis-1` | Redis 7 | Cache & message broker |
| `rri-qdrant-1` | Qdrant | Vector similarity search |
| `rri-ollama-1` | Ollama | Local LLM inference |

---

## Service Ports

| Service | Port | Protocol | URL |
|:--------|:-----|:---------|:----|
| Frontend | 3000 | HTTP | http://localhost:3000 |
| Backend API | 8000 | HTTP | http://localhost:8000 |
| Swagger Docs | 8000 | HTTP | http://localhost:8000/docs |
| PostgreSQL | 5432 | TCP | — |
| Redis | 6379 | TCP | — |
| Qdrant | 6333 | HTTP | http://localhost:6333/dashboard |
| Ollama | 11434 | HTTP | http://localhost:11434 |

---

## Public Access with Cloudflare Tunnel

RRI includes a Cloudflare Tunnel script for exposing your local instance to the internet with HTTPS — no port forwarding or static IP required.

```bash
# Start the tunnel
bash scripts/tunnel.sh
```

This gives you a public URL like `https://your-subdomain.trycloudflare.com`.

### Custom Domain

To use your own domain (e.g., `rri.yourdomain.com`):

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/)
2. Authenticate: `cloudflared tunnel login`
3. Create a tunnel: `cloudflared tunnel create rri`
4. Configure DNS in Cloudflare dashboard
5. Run: `cloudflared tunnel run rri`

---

## VPS Deployment

### Recommended Specs

| Component | Minimum | Recommended |
|:----------|:--------|:------------|
| **RAM** | 4 GB | 8 GB (for Ollama) |
| **CPU** | 2 cores | 4 cores |
| **Storage** | 20 GB | 50 GB |
| **OS** | Ubuntu 22.04+ | Ubuntu 24.04 |

### Affordable VPS Providers

| Provider | Plan | Price |
|:---------|:-----|:------|
| [Hetzner](https://hetzner.com) | CX22 (4GB RAM) | ~€4.5/month |
| [DigitalOcean](https://digitalocean.com) | Basic (4GB RAM) | ~$24/month |
| [Vultr](https://vultr.com) | Cloud Compute (4GB RAM) | ~$24/month |

### Setup Steps

```bash
# 1. SSH into your VPS
ssh root@your-server-ip

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Clone & deploy
git clone https://github.com/nhdandz/ResearchRover.git
cd ResearchRover
cp .env.example .env
# Edit .env with production keys

# 4. Start services
docker compose up -d
make migrate
make pull-model

# 5. (Optional) Set up Cloudflare Tunnel for HTTPS
bash scripts/tunnel.sh
```

---

## Resource Optimization

### Without Ollama (saves ~2GB RAM)

If you only need cloud LLM (OpenAI), you can skip Ollama:

```bash
# Start without Ollama
docker compose up -d app worker beat frontend postgres redis qdrant
```

This reduces RAM requirements to **2 GB**, making even cheaper VPS plans viable.

### Monitoring

```bash
# View all container logs
make logs

# Check container status
docker compose ps

# Monitor resource usage
docker stats
```
