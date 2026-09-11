#!/usr/bin/env python3
"""Audit static CardConjurer asset references against the bundled public tree."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PATH_RE = re.compile(r"[\"'`]((?:/)(?:img|data|fonts|local_art|creator|css|js)/[^\"'`?#\\]+)")
EXTENSIONS = {".js", ".html", ".css"}


def candidates(raw: str) -> list[Path]:
    rel = raw.lstrip("/")
    values = [PUBLIC / rel]
    if raw.startswith("/img/frames/m15/"):
        values.append(PUBLIC / "data/images/cardImages/m15" / raw.removeprefix("/img/frames/m15/"))
    if raw.startswith("/img/frames/m15/") and raw.endswith("Thumb.png"):
        values.append(PUBLIC / "data/images/cardImages/m15" / raw.removeprefix("/img/frames/m15/"))
    return values


def classify(path: str) -> str:
    if path.startswith("/img/frames/"):
        return "frames-and-masks"
    if "/mana" in path or "mana" in path.lower():
        return "mana"
    if "symbol" in path.lower() or "watermark" in path.lower():
        return "symbols-watermarks"
    if path.startswith("/fonts/"):
        return "fonts"
    if path.startswith("/data/"):
        return "data"
    return "other"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default=str(ROOT / "docs/cardconjurer-assets-audit.json"))
    parser.add_argument("--markdown", default=str(ROOT / "docs/cardconjurer-assets-audit.md"))
    args = parser.parse_args()

    references: dict[str, set[str]] = {}
    scanned_files = 0
    for path in PUBLIC.rglob("*"):
        if path.is_file() and path.suffix.lower() in EXTENSIONS:
            scanned_files += 1
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for raw in PATH_RE.findall(content):
                references.setdefault(raw, set()).add(str(path.relative_to(ROOT)))

    rows = []
    for raw in sorted(references):
        matched = next((candidate for candidate in candidates(raw) if candidate.is_file()), None)
        rows.append({
            "path": raw,
            "category": classify(raw),
            "status": "available" if matched else "missing",
            "resolvedPath": str(matched.relative_to(ROOT)) if matched else None,
            "referencedBy": sorted(references[raw]),
        })

    dynamic_rows = [row for row in rows if '${' in row['path'] or row['path'].endswith('/') or Path(row['path']).suffix == '']
    static_rows = [row for row in rows if row not in dynamic_rows]
    summary = {}
    for row in static_rows:
        bucket = summary.setdefault(row["category"], {"references": 0, "available": 0, "missing": 0})
        bucket["references"] += 1
        bucket[row["status"]] += 1

    result = {
        "project": ROOT.name,
        "scannedFiles": scanned_files,
        "uniqueReferences": len(rows),
        "dynamicOrNonFileReferences": len(dynamic_rows),
        "uniqueStaticReferences": len(static_rows),
        "available": sum(row["status"] == "available" for row in static_rows),
        "missing": sum(row["status"] == "missing" for row in static_rows),
        "summary": summary,
        "references": rows,
    }
    json_path = Path(args.json)
    markdown_path = Path(args.markdown)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    missing = [row for row in static_rows if row["status"] == "missing"]
    lines = [
        "# Auditoria de assets estáticos do CardConjurer",
        "",
        f"Arquivos analisados: **{scanned_files}**. Referências únicas: **{len(rows)}**; referências dinâmicas/diretórios não verificáveis: **{len(dynamic_rows)}**; referências de arquivos estáticas: **{len(static_rows)}**; disponíveis diretamente ou por alias conhecido: **{result['available']}**; ausentes no pacote: **{result['missing']}**.",
        "",
        "## Resumo por categoria",
        "",
        "| Categoria | Referências | Disponíveis | Ausentes |",
        "|---|---:|---:|---:|",
    ]
    for category, values in sorted(summary.items()):
        lines.append(f"| {category} | {values['references']} | {values['available']} | {values['missing']} |")
    lines += ["", "## Referências ausentes", ""]
    if missing:
        lines += ["| Caminho | Categoria | Referenciado por |", "|---|---|---|"]
        for row in missing:
            lines.append(f"| `{row['path']}` | {row['category']} | {', '.join(f'`{item}`' for item in row['referencedBy'][:3])} |")
    else:
        lines.append("Nenhuma referência estática ausente foi detectada.")
    lines += ["", "## Observações", "", "O relatório cobre strings estáticas. Caminhos montados dinamicamente, URLs externas e recursos escolhidos por dados de runtime exigem validação no smoke test e no navegador. Os aliases registrados são somente os que apontam para arquivos existentes no pacote.", ""]
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"json": str(json_path), "markdown": str(markdown_path), "scannedFiles": scanned_files, "uniqueReferences": len(rows), "staticReferences": len(static_rows), "dynamicOrNonFileReferences": len(dynamic_rows), "available": result["available"], "missing": result["missing"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
