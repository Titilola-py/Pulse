export const isNonEmpty = (value?: string | null) => {
  return Boolean(value && value.trim().length > 0)
}
