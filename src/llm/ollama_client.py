import json

import httpx

from src.core.logging import get_logger
from src.llm.base import BaseLLMClient

logger = get_logger(__name__)


class OllamaClient(BaseLLMClient):
    """Local LLM client using Ollama."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3:8b-instruct-q4_K_M"):
        self.base_url = base_url
        self.model = model
        self.client = httpx.AsyncClient(timeout=300)

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        system_prompt: str | None = None,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
                "stream": False,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "")

    async def generate_json(
        self,
        prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.1,
    ) -> dict:
        text = await self.generate(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt="You must respond with valid JSON only. No other text.",
        )
        # Try to extract JSON from response
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM JSON response", response=text[:200])
            return {}

    async def health_check(self) -> bool:
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            return response.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        await self.client.aclose()
