import { Link } from 'react-router-dom'

export default function PlayerName({ nickname, username }:
  { nickname: string; username?: string | null }) {
  if (!username) return <span>{nickname}</span>
  return <Link className="player-link" to={`/profile/${username}`}>{username}</Link>
}
