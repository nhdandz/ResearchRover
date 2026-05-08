"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { User, ExternalLink, BookOpen, TrendingUp } from "lucide-react";
import { fetchAuthor, fetchCoauthors, fetchAuthorNetwork } from "@/lib/api";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export default function AuthorProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [author, setAuthor] = useState<any>(null);
  const [coauthors, setCoauthors] = useState<any[]>([]);
  const [network, setNetwork] = useState<{ nodes: any[]; links: any[] }>({
    nodes: [],
    links: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchAuthor(id),
      fetchCoauthors(id, 15),
      fetchAuthorNetwork(id, 1),
    ])
      .then(([a, ca, net]) => {
        setAuthor(a);
        setCoauthors(ca.coauthors || []);
        setNetwork(net);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!author) return <div className="p-8">Author not found.</div>;

  return (
    <div className="container max-w-6xl py-8">
      <div className="rounded-lg border border-border bg-card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{author.name}</h1>
            {author.affiliations?.length > 0 && (
              <p className="text-muted-foreground mt-1">
                {author.affiliations.join(" · ")}
              </p>
            )}
            <div className="flex gap-4 mt-3 text-sm">
              <span>📄 {author.paper_count} papers</span>
              <span>📈 {author.citation_count} citations</span>
              {author.h_index != null && <span>h-index = {author.h_index}</span>}
            </div>
            <div className="flex gap-2 mt-2">
              {author.semantic_scholar_id && (
                <a
                  href={`https://www.semanticscholar.org/author/${author.semantic_scholar_id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs flex items-center gap-1 text-blue-500 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Semantic Scholar
                </a>
              )}
              {author.orcid && (
                <a
                  href={`https://orcid.org/${author.orcid}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs flex items-center gap-1 text-blue-500 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> ORCID
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Recent Papers
          </h2>
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {author.papers.map((p: any) => (
              <li
                key={p.id}
                className="rounded-md border border-border p-3 hover:border-primary/50"
              >
                <Link href={`/papers/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {p.published_date && <span>{p.published_date.slice(0, 7)}</span>}
                  {p.citation_count > 0 && <span>{p.citation_count} citations</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Top Co-authors
          </h2>
          <ul className="space-y-1.5 max-h-96 overflow-y-auto">
            {coauthors.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50"
              >
                <Link
                  href={`/authors/${c.id}`}
                  className="font-medium hover:underline truncate"
                >
                  {c.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {c.shared_papers} shared
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {network.nodes.length > 1 && (
        <div className="mt-8 rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Co-authorship Network</h2>
          </div>
          <div style={{ height: 500 }}>
            <ForceGraph2D
              graphData={network}
              nodeLabel={(n: any) => n.name}
              nodeAutoColorBy={(n: any) => (n.isFocus ? "focus" : "other")}
              nodeRelSize={4}
              linkWidth={(l: any) => Math.min(3, l.value || 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
