// Presentation only: the state engine and mutation handlers remain the authority.
export function quoteActions(row, state = row.status) {
  const open = ['DRAFT', 'SENT', 'ACCEPTED'].includes(state) && !row.order && !row.orderId
  return {
    send: open && state === 'DRAFT',
    accept: open && state === 'SENT',
    convert: open && state === 'ACCEPTED',
    link: open && state === 'SENT',
    cancel: open,
  }
}
