"""Convert a scanned PDF or document image to Markdown with PP-StructureV3."""

import argparse
import os
from pathlib import Path

os.environ["FLAGS_enable_pir_api"] = "0"

from paddleocr import PPStructureV3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="PDF or document image")
    parser.add_argument("output_dir", type=Path, help="Directory for Markdown and referenced images")
    parser.add_argument("--lang", default="vi", help="OCR language (default: vi)")
    args = parser.parse_args()

    source = args.input.resolve(strict=True)
    if not source.is_file():
        parser.error("input must be a file")
    destination = args.output_dir.resolve()
    destination.mkdir(parents=True, exist_ok=True)

    pipeline = PPStructureV3(
        lang=args.lang,
        device="cpu",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
    )
    pages = [result.markdown for result in pipeline.predict(input=str(source))]
    if not pages:
        raise RuntimeError("PaddleOCR returned no pages")

    markdown = pipeline.concatenate_markdown_pages(pages)["markdown_texts"]
    for page in pages:
        for relative_path, image in page.get("markdown_images", {}).items():
            image_path = (destination / relative_path).resolve()
            if not image_path.is_relative_to(destination):
                raise ValueError(f"Unsafe image path: {relative_path}")
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(image_path)

    output = destination / f"{source.stem}.md"
    output.write_text(markdown, encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
