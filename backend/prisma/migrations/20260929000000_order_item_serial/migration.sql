-- Espejo indexado de OrderItem.serials (ver modelo OrderItemSerial).
CREATE TABLE "OrderItemSerial" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemSerial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderItemSerial_orderItemId_serial_key" ON "OrderItemSerial"("orderItemId", "serial");
CREATE INDEX "OrderItemSerial_serial_idx" ON "OrderItemSerial"("serial");

ALTER TABLE "OrderItemSerial" ADD CONSTRAINT "OrderItemSerial_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill desde el JSON existente (idempotente).
INSERT INTO "OrderItemSerial" ("id", "orderItemId", "serial", "createdAt")
SELECT gen_random_uuid()::text, oi."id", s.value, o."createdAt"
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
CROSS JOIN LATERAL jsonb_array_elements_text(oi."serials") AS s(value)
WHERE jsonb_typeof(oi."serials") = 'array' AND s.value <> ''
ON CONFLICT ("orderItemId", "serial") DO NOTHING;
