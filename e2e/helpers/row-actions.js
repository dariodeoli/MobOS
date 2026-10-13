// Row actions are shown inline only for the next step of the state machine;
// the rest live in the row's "Más" menu (MenuDesplegable). Click either form.
export async function clickRowAction(page, row, name) {
  const direct = row.getByRole('button', { name, exact: true })
  if (await direct.count()) {
    await direct.click()
    return
  }
  await row.locator('button[aria-haspopup="menu"]').click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}
