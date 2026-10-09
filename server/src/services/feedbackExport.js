/**
 * Turns scans that have user feedback into retraining rows (one JSON object per line).
 * Deliberately EXCLUDES the owner/device id and GPS coordinates; district is kept for regional analysis.
 *
 * label_kind:
 *   confirmed  - user said "correct", label = the model's prediction
 *   corrected  - user said "not correct" and picked the real class, label = that class
 *   rejected   - user said "not correct" without a class: model was wrong, true label unknown (label = null)
 * Rows without feedback are not exported.
 */
export function toTrainingRow(doc) {
  const fb = doc.feedback;
  if (!fb || typeof fb.correct !== 'boolean') return null;
  const ai = doc.aiResponse ?? {};
  const predicted = ai.prediction?.class_key ?? null;

  let label = null;
  let kind = 'rejected';
  if (fb.correct && predicted) { label = predicted; kind = 'confirmed'; }
  else if (!fb.correct && fb.trueClass) { label = fb.trueClass; kind = 'corrected'; }
  else if (fb.correct && !predicted) return null; // "correct" on a low-confidence scan carries no label

  return {
    scan_id: String(doc._id),
    created_at: doc.createdAt,
    image_url: doc.imageRef?.url ?? null,
    district: doc.location?.district ?? null,
    model_version: ai.model_version ?? null,
    status: ai.status ?? null,
    predicted_class: predicted,
    confidence: ai.prediction?.confidence ?? null,
    top3: (ai.top3 ?? []).map((t) => ({ class_key: t.class_key, raw_prob: t.raw_prob })),
    label,
    label_kind: kind,
  };
}
