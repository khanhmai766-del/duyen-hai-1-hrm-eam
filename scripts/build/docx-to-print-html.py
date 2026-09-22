"""Build printable HTML copies of the two work permit DOCX templates.

Run with the Python environment from the MarkItDown skill:
  .claude/skills/markitdown/.venv/Scripts/python.exe scripts/build/docx-to-print-html.py
"""

from __future__ import annotations

from collections import defaultdict, deque
from html import escape
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from bs4 import BeautifulSoup, Tag
import mammoth


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "templates"
OUTPUT = SOURCE / "html"


def key(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split())


def text_of(element: ET.Element) -> str:
    parts = []
    for node in element.iter():
        if node.tag == W + "t":
            parts.append(node.text or "")
        elif node.tag in (W + "tab", W + "br", W + "cr"):
            parts.append(" ")
    return "".join(parts)


def twips_to_mm(value: str | None, fallback: float) -> float:
    return round(int(value) * 25.4 / 1440, 2) if value else fallback


def section_data(body: ET.Element) -> tuple[list[dict], list[str]]:
    children = list(body)
    sections = []
    split_after = []
    for index, child in enumerate(children):
        if child.tag == W + "p":
            section = child.find("./" + W + "pPr/" + W + "sectPr")
            if section is None:
                continue
            for following in children[index + 1 :]:
                marker = key(text_of(following))
                if marker:
                    split_after.append(marker)
                    break
            else:
                raise ValueError("Section break has no following content")
        elif child.tag == W + "sectPr":
            section = child
        else:
            continue
        if section is None:
            continue
        page = section.find(W + "pgSz")
        margins = section.find(W + "pgMar")
        if page is None:
            raise ValueError("Section has no page size")
        width = twips_to_mm(page.get(W + "w"), 210)
        height = twips_to_mm(page.get(W + "h"), 297)
        sections.append(
            {
                "width": width,
                "height": height,
                "top": twips_to_mm(margins.get(W + "top") if margins is not None else None, 15),
                "right": twips_to_mm(margins.get(W + "right") if margins is not None else None, 15),
                "bottom": twips_to_mm(margins.get(W + "bottom") if margins is not None else None, 15),
                "left": twips_to_mm(margins.get(W + "left") if margins is not None else None, 15),
            }
        )
    return sections, split_after


def table_data(body: ET.Element) -> list[dict]:
    result = []
    for table in body.iter(W + "tbl"):
        props = table.find(W + "tblPr")
        borders = props.find(W + "tblBorders") if props is not None else None
        style = props.find(W + "tblStyle") if props is not None else None
        values = [node.get(W + "val") for node in borders] if borders is not None else []
        if values:
            grid = any(value not in ("none", "nil", None) for value in values)
        else:
            grid = style is not None and style.get(W + "val", "").lower() == "tablegrid"
        widths = []
        grid_element = table.find(W + "tblGrid")
        if grid_element is not None:
            widths = [int(col.get(W + "w", "0")) for col in grid_element.findall(W + "gridCol")]
        rows = table.findall(W + "tr")
        first_row = rows[0] if rows else None
        repeat_header = first_row is not None and first_row.find("./" + W + "trPr/" + W + "tblHeader") is not None
        row_heights = []
        for row in rows:
            height = row.find("./" + W + "trPr/" + W + "trHeight")
            row_heights.append(twips_to_mm(height.get(W + "val"), 0) if height is not None else 0)
        first_row_empty = first_row is not None and not key(text_of(first_row))
        is_photo_grid = grid and len(rows) == 2 and first_row_empty and len(first_row.findall(W + "tc")) >= 2
        table_text = key(text_of(table)).upper()
        is_signature = (
            len(result) > 0
            and len(rows) <= 3
            and any(label in table_text for label in ("QUẢN ĐỐC", "TRƯỞNG PHÒNG", "NGƯỜI LẬP", "BÊN GIAO", "BÊN NHẬN"))
        )
        result.append(
            {
                "grid": grid,
                "widths": widths,
                "repeat_header": repeat_header,
                "row_heights": row_heights,
                "photo_grid": is_photo_grid,
                "signature": is_signature,
            }
        )
    return result


def paragraph_data(body: ET.Element) -> tuple[dict[str, deque[str]], set[str]]:
    alignment: dict[str, deque[str]] = defaultdict(deque)
    breaks = set()
    for paragraph in body.iter(W + "p"):
        content = key(text_of(paragraph))
        if not content:
            continue
        props = paragraph.find(W + "pPr")
        if props is not None:
            justify = props.find(W + "jc")
            if justify is not None:
                value = justify.get(W + "val", "")
                if value in ("center", "right", "both"):
                    alignment[content].append(value)
            if props.find(W + "pageBreakBefore") is not None:
                breaks.add(content)
        if any(node.get(W + "type") == "page" for node in paragraph.iter(W + "br")):
            breaks.add(content)
    return alignment, breaks


def number_as_letters(value: int, uppercase: bool) -> str:
    letters = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        letters = chr((65 if uppercase else 97) + remainder) + letters
    return letters


def number_as_roman(value: int, uppercase: bool) -> str:
    parts = []
    for amount, symbol in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while value >= amount:
            parts.append(symbol)
            value -= amount
    result = "".join(parts)
    return result if uppercase else result.lower()


def list_prefixes(body: ET.Element, numbering_xml: bytes | None) -> dict[str, deque[str]]:
    prefixes: dict[str, deque[str]] = defaultdict(deque)
    if not numbering_xml:
        return prefixes
    root = ET.fromstring(numbering_xml)
    abstracts = {node.get(W + "abstractNumId"): node for node in root.findall(W + "abstractNum")}
    numbers = {node.get(W + "numId"): node for node in root.findall(W + "num")}
    counters: dict[tuple[str, str], int] = {}

    for paragraph in body.iter(W + "p"):
        content = key(text_of(paragraph))
        props = paragraph.find(W + "pPr")
        num_props = props.find(W + "numPr") if props is not None else None
        if not content or num_props is None:
            continue
        num_id_node = num_props.find(W + "numId")
        level_node = num_props.find(W + "ilvl")
        num_id = num_id_node.get(W + "val") if num_id_node is not None else None
        level = level_node.get(W + "val", "0") if level_node is not None else "0"
        if not num_id or num_id == "0" or num_id not in numbers:
            continue
        number = numbers[num_id]
        abstract_id_node = number.find(W + "abstractNumId")
        abstract_id = abstract_id_node.get(W + "val") if abstract_id_node is not None else None
        abstract = abstracts.get(abstract_id)
        if abstract is None:
            continue
        definition = next((node for node in abstract.findall(W + "lvl") if node.get(W + "ilvl") == level), None)
        if definition is None:
            continue
        format_node = definition.find(W + "numFmt")
        text_node = definition.find(W + "lvlText")
        start_node = definition.find(W + "start")
        fmt = format_node.get(W + "val", "decimal") if format_node is not None else "decimal"
        template = text_node.get(W + "val", "%1.") if text_node is not None else "%1."
        start = int(start_node.get(W + "val", "1")) if start_node is not None else 1
        override = next((node for node in number.findall(W + "lvlOverride") if node.get(W + "ilvl") == level), None)
        if override is not None:
            start_override = override.find(W + "startOverride")
            if start_override is not None:
                start = int(start_override.get(W + "val", "1"))
        counter_key = (num_id, level)
        counters[counter_key] = counters.get(counter_key, start - 1) + 1
        value = counters[counter_key]
        if fmt == "decimal":
            rendered = str(value)
        elif fmt == "lowerLetter":
            rendered = number_as_letters(value, False)
        elif fmt == "upperLetter":
            rendered = number_as_letters(value, True)
        elif fmt == "lowerRoman":
            rendered = number_as_roman(value, False)
        elif fmt == "upperRoman":
            rendered = number_as_roman(value, True)
        elif fmt == "bullet":
            rendered = ""
            template = "•" if template and 0xE000 <= ord(template[0]) <= 0xF8FF else template
        else:
            rendered = str(value)
        prefix = re.sub(r"%[1-9]", rendered, template)
        prefixes[content].append(prefix)
    return prefixes


def add_list_prefixes(soup: BeautifulSoup, prefixes: dict[str, deque[str]]) -> None:
    for item in soup.find_all("li"):
        content = key(item.get_text("", strip=False))
        if content not in prefixes or not prefixes[content]:
            continue
        prefix = prefixes[content].popleft()
        marker = soup.new_tag("span")
        marker["class"] = "list-prefix"
        marker.string = prefix
        item.insert(0, marker)
        item["class"] = item.get("class", []) + ["explicit-list"]
    remaining = {content: list(items) for content, items in prefixes.items() if items}
    if remaining:
        raise ValueError(f"Could not map DOCX numbering to HTML lists: {remaining}")


def add_table_geometry(soup: BeautifulSoup, metadata: list[dict]) -> None:
    tables = soup.find_all("table")
    if len(tables) != len(metadata):
        raise ValueError(f"Table count changed: DOCX={len(metadata)}, HTML={len(tables)}")
    for index, (table, info) in enumerate(zip(tables, metadata)):
        classes = ["form-table", "grid" if info["grid"] else "plain"]
        if index == 0:
            classes.append("letterhead")
        if info["photo_grid"]:
            classes.append("photo-grid")
        if info["signature"]:
            classes.append("signature")
        table["class"] = classes
        for row, height in zip(table.find_all("tr"), info["row_heights"]):
            if height:
                row["style"] = f"height:{height}mm"
        widths = info["widths"]
        if widths and sum(widths) > 0:
            colgroup = soup.new_tag("colgroup")
            for width in widths:
                column = soup.new_tag("col")
                column["style"] = f"width:{width / sum(widths) * 100:.2f}%"
                colgroup.append(column)
            table.insert(0, colgroup)
        if info["repeat_header"]:
            first = table.find("tr")
            if first is not None and first.parent.name != "thead":
                header = soup.new_tag("thead")
                first.wrap(header)


def add_paragraph_geometry(soup: BeautifulSoup, alignment: dict[str, deque[str]], breaks: set[str]) -> None:
    for element in soup.find_all(["p", "li"]):
        content = key(element.get_text("", strip=False))
        if content in alignment and alignment[content]:
            value = alignment[content].popleft()
            element["class"] = element.get("class", []) + ["align-" + ("justify" if value == "both" else value)]
        if content in breaks:
            element["class"] = element.get("class", []) + ["page-break"]


def add_reference_layout(soup: BeautifulSoup, stem: str) -> None:
    """Page boundaries observed in Word's PDF for the source templates."""
    if stem == "work-permit-mechanical":
        table = next((t for t in soup.find_all("table") if "Số thẻ an toàn" in t.get_text(" ", strip=True)), None)
        if table is None:
            raise ValueError("Missing personnel table")
        table["class"] = table.get("class", []) + ["personnel-table"]
        for row in table.find_all("tr"):
            row.attrs.pop("style", None)


def section_html(soup: BeautifulSoup, sections: list[dict], markers: list[str]) -> tuple[str, str]:
    if len(sections) != len(markers) + 1:
        raise ValueError("Could not match DOCX sections to their start markers")
    top = [node for node in soup.contents if isinstance(node, Tag)]
    starts = [0]
    for marker in markers:
        matches = [index for index, node in enumerate(top) if key(node.get_text("", strip=False)) == marker]
        if len(matches) != 1:
            raise ValueError(f"Could not locate section start in HTML: {marker}")
        starts.append(matches[0])
    starts.append(len(top))
    if starts != sorted(starts) or len(set(starts)) != len(starts):
        raise ValueError("HTML sections appear out of order")

    page_css = []
    html = []
    for index, spec in enumerate(sections):
        page_css.append(
            f"@page sheet{index}{{size:{spec['width']}mm {spec['height']}mm;"
            f"margin:{spec['top']}mm {spec['right']}mm {spec['bottom']}mm {spec['left']}mm}}"
        )
        content = "".join(str(node) for node in top[starts[index] : starts[index + 1]])
        html.append(
            f'<section class="sheet sheet{index}" style="--paper-w:{spec["width"]}mm;'
            f'--paper-h:{spec["height"]}mm;--pad-t:{spec["top"]}mm;'
            f'--pad-r:{spec["right"]}mm;--pad-b:{spec["bottom"]}mm;'
            f'--pad-l:{spec["left"]}mm">{content}</section>'
        )
        page_css.append(f".sheet{index}{{page:sheet{index}}}")
    return "".join(html), "".join(page_css)


CSS = """
*{box-sizing:border-box}html{background:#e8eaed}body{margin:0;color:#111;font:12pt/1.3 "Times New Roman",serif}
.sheet{width:var(--paper-w);min-height:var(--paper-h);margin:16px auto;padding:var(--pad-t) var(--pad-r) var(--pad-b) var(--pad-l);background:#fff;box-shadow:0 3px 18px #0002;overflow-wrap:anywhere}
.sheet+ .sheet{break-before:page}p{margin:0 0 5.5pt}ol,ul{margin:3pt 0 5pt;padding-left:22pt}li{margin:0 0 3pt}
.explicit-list{list-style:none}.list-prefix{display:inline-block;min-width:18pt;margin-left:-18pt}
.align-center{text-align:center}.align-right{text-align:right}.align-justify{text-align:justify}.page-break{break-before:page}
.form-table{border-collapse:collapse;width:100%;table-layout:fixed;margin:3pt 0 6pt;font-size:10pt;line-height:1.2}
.form-table td,.form-table th{vertical-align:top;padding:2pt 3pt}.form-table.grid td,.form-table.grid th{border:.6pt solid #222}
.form-table.grid tr{height:6.5mm}
.form-table.plain td,.form-table.plain th{border:0}.form-table.letterhead{font-size:10.5pt;margin-top:0}
.form-table.letterhead td{text-align:center}.form-table p{margin:0}thead{display:table-header-group}tr{break-inside:avoid}
.form-table.signature td{height:26mm;text-align:center}.form-table.signature td p:last-child{margin-top:12mm}
body.work-permit-mechanical.filled .personnel-table tr{height:8.5mm}
@media print{html{background:#fff}body{margin:0}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;overflow:visible}}
""".strip()


def convert(path: Path, output: Path) -> dict:
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
        body = root.find(W + "body")
        if body is None:
            raise ValueError(f"No document body: {path}")
        images = [name for name in archive.namelist() if name.startswith("word/media/")]
        if images:
            raise ValueError(f"Embedded images need separate handling: {path}")
        sections, markers = section_data(body)
        tables = table_data(body)
        alignment, breaks = paragraph_data(body)
        source_tokens = set(re.findall(r"\{\{[^{}]+\}\}", text_of(body)))
        numbering_xml = archive.read("word/numbering.xml") if "word/numbering.xml" in archive.namelist() else None
        prefixes = list_prefixes(body, numbering_xml)

    with path.open("rb") as stream:
        converted = mammoth.convert_to_html(stream)
    soup = BeautifulSoup(converted.value, "html.parser")
    add_list_prefixes(soup, prefixes)
    add_table_geometry(soup, tables)
    add_paragraph_geometry(soup, alignment, breaks)
    add_reference_layout(soup, path.stem)
    content, page_css = section_html(soup, sections, markers)
    result_tokens = set(re.findall(r"\{\{[^{}]+\}\}", soup.get_text("")))
    if source_tokens != result_tokens:
        raise ValueError(f"Placeholder mismatch: {path.name}: missing={source_tokens - result_tokens}, added={result_tokens - source_tokens}")

    title = escape(path.stem)
    document = (
        '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{title}</title><style>{page_css}{CSS}</style></head><body class=\"{title}\">{content}</body></html>"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document, encoding="utf-8")
    return {
        "source": path.name,
        "html": output.name,
        "docx_bytes": path.stat().st_size,
        "html_bytes": output.stat().st_size,
        "tables": len(tables),
        "sections": len(sections),
        "warnings": len(converted.messages),
    }


def main() -> None:
    for name in ("work-permit-electrical.docx", "work-permit-mechanical.docx"):
        path = SOURCE / name
        result = convert(path, OUTPUT / (path.stem + ".html"))
        print(
            f"{result['source']} -> {result['html']}: "
            f"{result['docx_bytes']} -> {result['html_bytes']} bytes, "
            f"{result['tables']} tables, {result['sections']} sections, "
            f"{result['warnings']} Mammoth warnings"
        )


if __name__ == "__main__":
    main()
