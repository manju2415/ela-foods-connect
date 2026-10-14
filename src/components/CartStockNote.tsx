interface CartStockNoteProps {
  quantity: number;
  /** Central stock of the product, or of the chosen pack option. */
  stock: number | null | undefined;
  /** Best single pickup store's stock for the product (useStorePickupStockMap). */
  pickupStock?: number;
}

/**
 * Tells the customer, on the cart line itself, that an item can't be
 * ordered in the quantity they have — checkout then offers to remove it.
 */
export const CartStockNote = ({ quantity, stock, pickupStock = 0 }: CartStockNoteProps) => {
  if (stock == null) return null;
  const available = Math.max(stock, pickupStock, 0);
  if (quantity <= available) return null;
  return (
    <p className="mt-0.5 text-xs font-semibold text-destructive">
      {available === 0 ? "Out of stock — please remove this item" : `Only ${available} available — please reduce the quantity`}
    </p>
  );
};
