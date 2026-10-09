import mongoose from 'mongoose';

const { Schema } = mongoose;

const imageRefSchema = new Schema({ provider: String, url: String, publicId: String }, { _id: false });
const locationSchema = new Schema({ lat: Number, lon: Number, district: String }, { _id: false });
const feedbackSchema = new Schema({ correct: { type: Boolean, required: true }, trueClass: { type: String, default: null }, at: Date }, { _id: false });

const scanSchema = new Schema(
  {
    owner: { type: String, required: true, index: true }, // 'device:<uuid>' now; JWT user id later
    imageRef: { type: imageRefSchema, default: null },    // null if the image upload failed (see `warnings`)
    location: { type: locationSchema, default: null },
    cropAgeDays: { type: Number, default: null },
    aiResponse: { type: Schema.Types.Mixed, required: true }, // full /predict contract, stored verbatim
    feedback: { type: feedbackSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const Scan = mongoose.models.Scan || mongoose.model('Scan', scanSchema);

/** Public JSON shape (works for lean docs and documents). Owner is deliberately not exposed. */
export function toDto(d) {
  return {
    id: String(d._id),
    imageRef: d.imageRef ?? null,
    location: d.location ?? null,
    cropAgeDays: d.cropAgeDays ?? null,
    aiResponse: d.aiResponse,
    feedback: d.feedback ?? null,
    createdAt: d.createdAt,
  };
}
