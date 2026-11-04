/** An address that wraps after the @ before it wraps anywhere else. */
export const EmailText = ({ email }: { email: string }) => {
  const at = email.indexOf('@')
  if (at < 0) return <>{email}</>
  return <>{email.slice(0, at)}<wbr />{email.slice(at)}</>
}
