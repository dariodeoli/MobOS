-- Renombra los pedidos sembrados de iStore al formato real del export
-- (Shopify usa el prefijo "KO"): '#31791' → 'KO #31791'. Idempotente:
-- solo toca pedidos del tenant que empiezan con '#' y aún no tienen el
-- prefijo KO; las órdenes nuevas creadas en la app no se ven afectadas.
DO $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = 'cmtz36apy00002ephu1gv7tkt';
  IF v_tenant_id IS NULL THEN RETURN; END IF;
  UPDATE "Order"
    SET "orderNumber" = 'KO ' || "orderNumber", "updatedAt" = now()
    WHERE "tenantId" = v_tenant_id
      AND "orderNumber" LIKE '#%'
      AND "orderNumber" NOT LIKE 'KO %';
END $$;
