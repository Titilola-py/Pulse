export type User = {
  id: string | number
  username: string
  email: string
  full_name?: string | null
}

export type UserSearchResult = {
  id: string | number
  username: string
  full_name?: string | null
}
