import { z } from "zod";

const uuid = z.string().uuid();
const nonNegativeMoney = z.coerce.number().finite().min(0).max(1_000_000);
const positiveMoney = z.coerce
  .number()
  .finite()
  .positive()
  .max(1_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8);

export const loginSchema = z.object({
  email: z.email().max(150).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export const setupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(150).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(200),
});

export const areaSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).nullable().optional(),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  hourlyRate: nonNegativeMoney,
  totalSlots: z.coerce.number().int().min(1).max(100_000),
  status: z.enum(["active", "inactive", "maintenance"]).default("active"),
});

export const slotSchema = z.object({
  areaId: uuid,
  slotNumber: z.string().trim().min(1).max(20),
  slotType: z.enum(["standard", "compact", "disabled", "vip", "two_wheeler"]),
  floorNumber: z.coerce.number().int().min(-20).max(200).nullable().optional(),
  rowLabel: z.string().trim().max(10).nullable().optional(),
});

export const slotStatusSchema = z.object({
  currentStatus: z.enum(["available", "maintenance", "blocked"]),
});

export const driverSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().max(150).transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().min(7).max(20),
  licenseNumber: z.string().trim().min(4).max(40),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
});

export const vehicleSchema = z.object({
  driverId: uuid,
  licensePlate: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  make: z.string().trim().max(50).nullable().optional(),
  model: z.string().trim().max(60).nullable().optional(),
  year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  color: z.string().trim().max(30).nullable().optional(),
  vehicleType: z.enum(["car", "bike", "truck", "bus", "van"]),
  registrationNumber: z.string().trim().max(40).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const allocationSchema = z.object({
  slotId: uuid,
  vehicleId: uuid,
  driverId: uuid,
  expectedCheckOutTime: z.iso.datetime().nullable().optional(),
});

export const violationTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
  defaultFine: nonNegativeMoney,
  severity: z.enum(["low", "medium", "high", "critical"]),
});

export const violationSchema = z.object({
  allocationId: uuid,
  violationTypeId: z.coerce.number().int().min(1),
  description: z.string().trim().min(3).max(2000),
});

export const violationStatusSchema = z.object({
  status: z.enum(["disputed", "waived", "closed"]),
  reason: z.string().trim().min(3).max(1000),
});

const paymentCommon = {
  paymentMethod: z.enum(["cash", "card", "upi", "bank_transfer", "wallet"]),
  transactionReference: z.string().trim().min(1).max(80).nullable().optional(),
};

export const paymentSchema = z.discriminatedUnion("paymentCategory", [
  z.object({
    paymentCategory: z.literal("parking_fee"),
    allocationId: uuid,
    amount: positiveMoney,
    ...paymentCommon,
  }),
  z.object({
    paymentCategory: z.literal("violation_fine"),
    driverId: uuid,
    vehicleId: uuid.nullable().optional(),
    amount: positiveMoney,
    applications: z
      .array(
        z.object({
          violationId: uuid,
          amountApplied: positiveMoney,
        }),
      )
      .min(1)
      .max(50)
      .refine(
        (applications) =>
          new Set(applications.map((application) => application.violationId)).size ===
          applications.length,
        "A violation can only appear once per payment.",
      ),
    ...paymentCommon,
  }),
]);

export const noticeSchema = z.object({
  violationId: uuid,
  noticeType: z.enum([
    "fine_notice",
    "payment_reminder",
    "overdue_notice",
    "dispute_notice",
  ]),
  eventRef: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(2).max(5000),
});

export const noticeStatusSchema = z.object({
  status: z.enum(["sent", "viewed", "paid", "expired", "cancelled"]),
});

export const auditLogQuerySchema = z.object({
  eventType: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  actorType: z.string().trim().min(1).max(40).optional(),
  entityId: z.string().trim().min(1).max(80).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
}).refine((input) => !input.from || !input.to || input.from <= input.to, {
  message: "from must not be after to.",
  path: ["to"],
});

export const uuidSchema = uuid;
