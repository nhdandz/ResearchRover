"""rri chat - Interactive RAG REPL."""

import sys
from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

from src.cli._async import run

console = Console()


def chat_command(
    cloud: Annotated[bool, typer.Option(help="Use cloud LLM (OpenAI)")] = False,
    no_rerank: Annotated[bool, typer.Option(help="Disable reranking")] = False,
    collection: Annotated[Optional[list[str]], typer.Option(help="Collections to search (papers, repositories, chunks). Repeat for multiple.")] = None,
) -> None:
    """Start interactive RAG chat."""
    if not sys.stdin.isatty():
        console.print(
            "[red]Interactive terminal required.[/red]\n"
            "Use: [bold]docker exec -it rri-app-1 rri chat[/bold]"
        )
        raise typer.Exit(1)
    collections = collection or ["papers", "repositories", "chunks"]
    run(_chat_loop(cloud, no_rerank, collections))


async def _chat_loop(cloud: bool, no_rerank: bool, collections: list[str]) -> None:
    from src.cli._context import get_embedding_generator, get_llm_client, get_vector_store
    from src.rag.generator import AnswerGenerator
    from src.rag.pipeline import RAGPipeline
    from src.rag.reranker import CrossEncoderReranker
    from src.rag.retriever import HybridRetriever

    # Initialize components
    llm = get_llm_client(cloud=cloud)
    if not llm:
        console.print("[red]LLM client required for chat[/red]")
        raise typer.Exit(1)

    vector_store = get_vector_store()
    embedding_gen = get_embedding_generator()

    rag_available = vector_store is not None and embedding_gen is not None

    pipeline = None
    retriever = None
    if rag_available:
        retriever = HybridRetriever(
            vector_store=vector_store,
            embedding_model=embedding_gen,
        )
        reranker = None if no_rerank else CrossEncoderReranker()
        generator = AnswerGenerator(llm_client=llm)
        pipeline = RAGPipeline(
            retriever=retriever,
            reranker=reranker,
            generator=generator,
            llm_client=llm,
        )

    mode = "cloud" if cloud else "local"
    rerank_status = "off" if no_rerank else "on"
    rag_status = "on" if rag_available else "[yellow]off (no vector store)[/yellow]"
    collections_str = ", ".join(collections)
    console.print(
        Panel(
            f"[bold]RRI Chat[/bold] | LLM: {mode} | RAG: {rag_status} | Rerank: {rerank_status} | Collections: {collections_str}\n"
            "Type your question and press Enter. Type [bold]quit[/bold] or [bold]exit[/bold] to leave.",
            border_style="blue",
        )
    )

    while True:
        try:
            question = console.input("\n[bold cyan]You>[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not question:
            continue
        if question.lower() in ("quit", "exit", "q"):
            break

        _SOURCE_ICONS = {
            "papers": "[cyan][Paper][/cyan]",
            "repositories": "[green][Repo][/green]",
            "chunks": "[yellow][Chunk][/yellow]",
        }

        try:
            if pipeline and retriever:
                # Patch retriever to use selected collections
                _orig_retrieve = retriever.retrieve

                async def _filtered_retrieve(query, top_k=10, filters=None, **kw):
                    return await _orig_retrieve(query, top_k=top_k, filters=filters, collections=collections)

                retriever.retrieve = _filtered_retrieve

                response = await pipeline.query(
                    question=question,
                    top_k=10,
                    rerank_top_k=5,
                )

                retriever.retrieve = _orig_retrieve

                console.print()
                console.print(Markdown(response.answer))

                if response.sources:
                    console.print("\n[dim]Sources:[/dim]")
                    for i, src in enumerate(response.sources, 1):
                        title = src.get("title", "Unknown")
                        url = src.get("url", "")
                        src_type = src.get("type", "")
                        icon = _SOURCE_ICONS.get(src_type, f"[dim][{src_type}][/dim]")
                        score = src.get("relevance_score", 0)
                        line = f"  {icon} {i}. {title}"
                        if score:
                            line += f" [dim](score: {score:.3f})[/dim]"
                        if url:
                            line += f" [dim]- {url}[/dim]"
                        console.print(line)

                console.print(f"\n[dim]Confidence: {response.confidence:.0%}[/dim]")
            else:
                # Direct LLM mode (no RAG)
                answer = await llm.generate(
                    question,
                    max_tokens=1000,
                    temperature=0.7,
                    system_prompt="You are a helpful research assistant. Answer questions clearly and concisely.",
                )
                console.print()
                console.print(Markdown(answer))

        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")

    console.print("\n[dim]Goodbye![/dim]")

    if hasattr(llm, "close"):
        await llm.close()
