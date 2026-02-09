WEEKLY_REPORT_PROMPT = """
Generate a weekly research digest based on the following data:

Period: {period_start} to {period_end}

New Papers ({paper_count} total):
{papers_summary}

Trending Repositories ({repo_count} total):
{repos_summary}

Notable Changes:
{changes_summary}

You MUST respond with valid JSON only (no markdown, no explanation).
The JSON must have this exact structure:
{{
    "title": "Weekly AI Research Digest: {period_start} - {period_end}",
    "summary": "A 2-3 sentence overview of the most important developments this week",
    "highlights": ["highlight 1", "highlight 2", "highlight 3"],
    "content": "A detailed markdown report covering:\\n1. Key highlights\\n2. Trending topics and emerging technologies\\n3. Notable new papers and their implications\\n4. Active repositories and community momentum"
}}

Rules:
- "highlights" must be an array of 3-5 short strings (1 sentence each)
- "content" must be a detailed markdown-formatted report (500+ words)
- "summary" must be a concise paragraph (2-3 sentences)
- "title" should be descriptive and include the date range
- Use \\n for newlines in the content field
"""

TECH_RADAR_PROMPT = """
You are an AI/ML technology analyst. Based on the data below from research papers and open-source repositories,
create a Tech Radar that categorizes SPECIFIC TECHNOLOGIES, FRAMEWORKS, LIBRARIES, and TOOLS (NOT programming languages).

IMPORTANT RULES:
- Do NOT include programming languages (Python, JavaScript, Go, etc.) — they are too broad
- Focus on specific frameworks, libraries, tools, techniques, and architectures
  Examples: PyTorch, LangChain, RAG, Transformer, RLHF, Vector Databases, LoRA, vLLM, Ollama, FastAPI, Next.js
- Each item must be a concrete technology that a developer would choose to adopt or not
- Aim for 4-6 items per ring (16-24 total)
- Base your analysis on the evidence in the data: repo stars, growth, paper citations, and research trends

Data:
{data}

Ring definitions:
- ADOPT: Mature, widely used, strong community. High stars, many repos, active development. Recommended for production.
- TRIAL: Gaining traction, promising results. Growing stars/citations. Worth investing time to evaluate.
- ASSESS: Early stage but interesting. New papers, few but fast-growing repos. Monitor for potential.
- HOLD: Declining activity, being superseded. Fewer new repos/papers, stagnant growth.

Respond ONLY with valid JSON (no markdown, no explanation):
{{
    "adopt": [{{"name": "technology name", "reason": "1-sentence evidence-based reason"}}],
    "trial": [{{"name": "technology name", "reason": "1-sentence evidence-based reason"}}],
    "assess": [{{"name": "technology name", "reason": "1-sentence evidence-based reason"}}],
    "hold": [{{"name": "technology name", "reason": "1-sentence evidence-based reason"}}]
}}
"""
