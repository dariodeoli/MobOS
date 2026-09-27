-- #148 §9 · Montos 10B/99B: las columnas de dinero pasan de integer (32 bits)
-- a bigint para soportar los topes de producto (general 10.000.000.000 y
-- ventas 99.000.000.000). Aditiva e idempotente: solo altera columnas que
-- todavía están en integer y no toca los datos existentes.
DO $$
DECLARE
  columna record;
BEGIN
  FOR columna IN
    SELECT * FROM (VALUES
      ('Tenant', 'expenseLimitPyg'),
      ('Tenant', 'purchaseCreditLimitPyg'),
      ('User', 'dailyGoalPyg'),
      ('Product', 'pricePyg'),
      ('Product', 'wholesalePricePyg'),
      ('Product', 'costPyg'),
      ('InventoryUnit', 'costPyg'),
      ('InventoryUnit', 'consignorPyg'),
      ('Customer', 'creditLimitPyg'),
      ('CommissionSettlement', 'totalPyg'),
      ('CommissionSettlement', 'marginPyg'),
      ('Combo', 'pricePyg'),
      ('Quote', 'subtotalPyg'),
      ('Quote', 'discountPyg'),
      ('Quote', 'totalPyg'),
      ('Order', 'subtotalPyg'),
      ('Order', 'discountPyg'),
      ('Order', 'deliveryPyg'),
      ('Order', 'totalPyg'),
      ('OrderItem', 'unitPricePyg'),
      ('OrderItem', 'listPricePyg'),
      ('OrderItem', 'unitCostPyg'),
      ('OrderItem', 'baseUnitCostPyg'),
      ('OrderItem', 'insurancePyg'),
      ('OrderItem', 'extraCostPyg'),
      ('OrderItem', 'totalPyg'),
      ('OrderItem', 'discountPyg'),
      ('Promotion', 'value'),
      ('Payment', 'amountPyg'),
      ('ReconciliationBatch', 'expectedPyg'),
      ('ReconciliationBatch', 'receivedPyg'),
      ('ReconciliationBatch', 'differencePyg'),
      ('StoreCredit', 'amountPyg'),
      ('StoreCredit', 'remainingPyg'),
      ('StoreCreditUse', 'amountPyg'),
      ('DeliverySettlement', 'totalPyg'),
      ('DeliverySettlement', 'pendingPyg'),
      ('PriceListItem', 'unitPricePyg'),
      ('PriceTier', 'unitPricePyg'),
      ('TradeInDevice', 'valuePyg'),
      ('TradeInDevice', 'repairCostPyg'),
      ('DeviceValuation', 'baseValuePyg'),
      ('DeviceValuation', 'maxValuePyg'),
      ('CashSession', 'openingPyg'),
      ('CashSession', 'countedPyg'),
      ('CashSession', 'expectedPyg'),
      ('CashMovement', 'amountPyg'),
      ('SupplierPayable', 'amountPyg'),
      ('SupplierPayable', 'paidPyg'),
      ('SupplierPayable', 'consumedPyg'),
      ('PurchaseOrder', 'shippingPyg'),
      ('PurchaseOrder', 'customsPyg'),
      ('PurchaseOrder', 'insurancePyg'),
      ('PurchaseOrder', 'taxesPyg'),
      ('PurchaseOrder', 'otherCostsPyg'),
      ('SupplyPurchase', 'costPyg'),
      ('SupplyPurchaseLine', 'unitCostPyg'),
      ('WorkshopPart', 'unitCostPyg'),
      ('WorkshopPart', 'totalCostPyg'),
      ('WorkshopPartMovement', 'amountPyg'),
      ('PurchaseLine', 'unitCostPyg'),
      ('PurchaseLine', 'baseTotalPyg'),
      ('PurchaseLine', 'allocatedShippingPyg'),
      ('PurchaseLine', 'allocatedCustomsPyg'),
      ('PurchaseLine', 'allocatedInsurancePyg'),
      ('PurchaseLine', 'allocatedTaxesPyg'),
      ('PurchaseLine', 'allocatedOtherCostsPyg'),
      ('PurchaseLine', 'allocatedExtraCostPyg'),
      ('PurchaseLine', 'finalTotalCostPyg'),
      ('PurchaseLine', 'finalUnitCostPyg'),
      ('PurchaseReturn', 'totalPyg'),
      ('PurchaseReturnLine', 'unitCostPyg'),
      ('PurchaseReturnLine', 'totalPyg'),
      ('PurchasePayment', 'amountPyg'),
      ('WarrantyCase', 'repairCostPyg'),
      ('ServiceOrder', 'pricePyg'),
      ('ServiceOrder', 'costPyg'),
      ('ServiceOrder', 'partsPyg'),
      ('ServiceOrder', 'laborPyg'),
      ('ServiceOrder', 'otherCostPyg'),
      ('ServiceItem', 'suggestedPricePyg')
    ) AS t(tabla, columna)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = columna.tabla
        AND c.column_name = columna.columna
        AND c.data_type = 'integer'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', columna.tabla, columna.columna);
    END IF;
  END LOOP;
END $$;
