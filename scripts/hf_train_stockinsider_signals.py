#!/usr/bin/env python3
"""Fine-tune assistive StockInsider HF classifiers locally.

Usage example:
  python3 scripts/hf_train_stockinsider_signals.py \
    --dataset .agent/datasets/stockinsider-hf-signals.jsonl \
    --task sentiment \
    --base-model hw2942/bert-base-chinese-finetuning-financial-news-sentiment-v2

The resulting model is an assistive signal only. It must not directly promote
stocks into formal recommendations.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


LABELS = {
    "sentiment": ["bearish", "neutral", "bullish"],
    "evidence_strength": ["low", "medium", "high"],
}

BASELINE_MODELS = {
    "sentiment_zh": "yiyanghkust/finbert-tone-chinese",
    "sentiment_zh_fast": "bardsai/finance-sentiment-zh-fast",
    "sentiment_zh_news": "hw2942/bert-base-chinese-finetuning-financial-news-sentiment-v2",
    "sentiment_en": "ProsusAI/finbert",
    "embedding_zh": "BAAI/bge-m3",
    "reranker_zh": "BAAI/bge-reranker-v2-m3",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--task", choices=sorted(LABELS), default="sentiment")
    parser.add_argument(
        "--base-model",
        default=BASELINE_MODELS["sentiment_zh_news"],
        help=(
            "HF model id. Suggested assistive baselines: "
            + ", ".join(f"{key}={value}" for key, value in BASELINE_MODELS.items())
        ),
    )
    parser.add_argument("--output-dir", type=Path, default=Path(".agent/models/stockinsider-signals"))
    parser.add_argument("--epochs", type=float, default=2)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    try:
        from datasets import Dataset
        from transformers import AutoModelForSequenceClassification, AutoTokenizer, Trainer, TrainingArguments
    except Exception as exc:  # pragma: no cover - dependency guard
        raise SystemExit(
            "Missing dependencies. Install locally with: pip install transformers datasets torch accelerate"
        ) from exc

    rows = [json.loads(line) for line in args.dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    label_key = "sentiment_label" if args.task == "sentiment" else "evidence_strength_label"
    label_to_id = {label: idx for idx, label in enumerate(LABELS[args.task])}
    rows = [row for row in rows if row.get(label_key) in label_to_id]
    if len(rows) < 20:
        raise SystemExit(f"Need at least 20 labeled rows for {args.task}; got {len(rows)}")

    ds = Dataset.from_list([
        {"text": row["text"], "label": label_to_id[row[label_key]]}
        for row in rows
    ]).train_test_split(test_size=0.2, seed=42)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)

    def tokenize(batch):
        return tokenizer(batch["text"], truncation=True, max_length=512)

    tokenized = ds.map(tokenize, batched=True)
    model = AutoModelForSequenceClassification.from_pretrained(
      args.base_model,
      num_labels=len(label_to_id),
      id2label={idx: label for label, idx in label_to_id.items()},
      label2id=label_to_id,
      ignore_mismatched_sizes=True,
    )

    output_dir = args.output_dir / args.task
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=20,
        report_to=[],
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["test"],
        tokenizer=tokenizer,
    )
    trainer.train()
    metrics = trainer.evaluate()
    trainer.save_model(str(output_dir / "final"))
    (output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output_dir / "final"), "metrics": metrics}, ensure_ascii=False))


if __name__ == "__main__":
    main()
