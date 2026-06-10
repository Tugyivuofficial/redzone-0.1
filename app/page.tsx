'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, hasSupabaseEnv } from '@/lib/supabase';
import { Swords, ShieldCheck, LogOut } from 'lucide-react';

type Profile = { id: string; username: string; discord: string | null; role: string };
type Team = { id: string; name: string; tag: string; captain_id: string; wins: number; losses: number };
type Match = { id: string; team_a: string; team_b: string; room_code: string | null; score_a: number | null; score_b: number | null; status: string; winner_team: string | null; submitted_by: string | null; confirmed_by: string | null; created_at: string };

const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/yourserver';

export default function Home() {
  const [tab, setTab] = useState('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [discord, setDiscord] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamTag, setTeamTag] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const sortedTeams = useMemo(() => [...teams].sort((a, b) => b.wins - a.wins || a.losses - b.losses), [teams]);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 3200);
  }

  async function load() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setProfile(p as Profile | null);
    } else setProfile(null);

    const { data: t } = await supabase.from('teams').select('*').order('wins', { ascending: false });
    const { data: m } = await supabase.from('matches').select('*').order('created_at', { ascending: false });
    setTeams((t || []) as Team[]);
    setMatches((m || []) as Match[]);
  }

  useEffect(() => {
    load();
    const client = supabase;
    if (!client) return;
    const { data: sub } = client.auth.onAuthStateChange(() => load());
    const channel = client.channel('redzone-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => { sub.subscription.unsubscribe(); client.removeChannel(channel); };
  }, []);

  async function signUp() {
    if (!supabase) return notify('Supabase env тохируулаагүй байна.');
    if (!email || !password || !username) return notify('Email, password, username бөглөнө үү.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setBusy(false); return notify(error.message); }
    const userId = data.user?.id;
    if (userId) {
      const { error: pErr } = await supabase.from('profiles').insert({ id: userId, username, discord });
      if (pErr) notify(pErr.message); else notify('Account үүслээ. Email confirm шаардвал mail-ээ шалга.');
    }
    setBusy(false); load();
  }

  async function signIn() {
    if (!supabase) return notify('Supabase env тохируулаагүй байна.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return notify(error.message);
    notify('Logged in.'); load();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null); notify('Logged out.');
  }

  async function createTeam() {
    if (!supabase || !profile) return notify('Эхлээд login хийнэ.');
    if (!teamName || !teamTag) return notify('Team name/tag бөглөнө үү.');
    setBusy(true);
    const { data, error } = await supabase.from('teams').insert({ name: teamName, tag: teamTag.toUpperCase(), captain_id: profile.id }).select('*').single();
    if (error) { setBusy(false); return notify(error.message); }
    await supabase.from('team_members').insert({ team_id: data.id, profile_id: profile.id, member_role: 'captain' });
    setTeamName(''); setTeamTag(''); setBusy(false); notify('Team үүслээ.'); load();
  }

  async function createMatch() {
    if (!supabase || !profile) return notify('Эхлээд login хийнэ.');
    if (!teamA || !teamB || teamA === teamB) return notify('2 өөр team сонгоно уу.');
    setBusy(true);
    const { error } = await supabase.from('matches').insert({ team_a: teamA, team_b: teamB, room_code: roomCode || null });
    setBusy(false);
    if (error) return notify(error.message);
    setRoomCode(''); notify('Match үүслээ.'); load();
  }

  async function submitScore(match: Match) {
    if (!supabase || !profile) return notify('Login хэрэгтэй.');
    const scoreA = Number(prompt(`${teamById.get(match.team_a)?.tag || 'Team A'} score:`));
    const scoreB = Number(prompt(`${teamById.get(match.team_b)?.tag || 'Team B'} score:`));
    if (Number.isNaN(scoreA) || Number.isNaN(scoreB) || scoreA === scoreB) return notify('Score буруу байна.');
    const winner = scoreA > scoreB ? match.team_a : match.team_b;
    const { error } = await supabase.from('matches').update({ score_a: scoreA, score_b: scoreB, winner_team: winner, submitted_by: profile.id, status: 'submitted' }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Score илгээгдлээ. Нөгөө тал confirm хийнэ.'); load();
  }

  async function confirmMatch(match: Match) {
    if (!supabase || !profile) return notify('Login хэрэгтэй.');
    const { error } = await supabase.from('matches').update({ status: 'confirmed', confirmed_by: profile.id }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Match confirmed. Leaderboard шинэчлэгдэнэ.'); load();
  }

  async function disputeMatch(match: Match) {
    if (!supabase || !profile) return notify('Login хэрэгтэй.');
    const { error } = await supabase.from('matches').update({ status: 'disputed' }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Dispute үүслээ. Admin Discord дээр шалгана.'); load();
  }

  return <main className="bg">
    <nav className="nav"><div className="wrap navin">
      <div className="brand"><div className="logo"><Swords size={22}/></div><span>REDZONE ARENA</span></div>
      <div className="navlinks">
        {['home','teams','matches','leaderboard','admin'].map(x => <a key={x} href={`#${x}`} onClick={() => setTab(x)}>{x.toUpperCase()}</a>)}
        <a href={discordInvite} target="_blank">DISCORD</a>
        {profile ? <button className="btn small ghost" onClick={signOut}><LogOut size={14}/> Logout</button> : <button className="btn small" onClick={() => setTab('auth')}>LOGIN</button>}
      </div>
    </div></nav>

    <section className="wrap hero" id="home">
      <div>
        <div className="badge"><ShieldCheck size={16}/> Discord verify + result confirm system</div>
        <h1>Standoff 2 <span className="grad">Tournament</span> Hub</h1>
        <p className="lead">Team үүсгээд match зарлана. Score submit хийнэ. Нөгөө тал confirm хийвэл leaderboard автоматаар шинэчлэгдэнэ. Маргаан гарвал dispute болж Discord/admin шалгана.</p>
        <div className="actions"><button className="btn" onClick={() => setTab(profile?'matches':'auth')}>Start Match</button><a className="btn ghost" href={discordInvite} target="_blank">Join Discord</a></div>
      </div>
      <div className="panel">
        {!hasSupabaseEnv && <div className="card"><b>Supabase env хэрэгтэй</b><p className="muted">Vercel Environment Variables дээр NEXT_PUBLIC_SUPABASE_URL болон NEXT_PUBLIC_SUPABASE_ANON_KEY нэмнэ.</p></div>}
        <div className="grid">
          <div className="card stat"><b>{teams.length}</b><span>Teams</span></div>
          <div className="card stat"><b>{matches.length}</b><span>Matches</span></div>
          <div className="card stat"><b>{matches.filter(m=>m.status==='confirmed').length}</b><span>Confirmed</span></div>
        </div>
        <div className="card"><b>{profile ? `Logged in: ${profile.username}` : 'Not logged in'}</b><p className="muted">{profile?.discord || 'Discord username холбоно уу.'}</p></div>
      </div>
    </section>

    <section className="wrap section">
      <div className="tabs">{['auth','teams','matches','leaderboard','admin'].map(x => <button key={x} onClick={() => setTab(x)} className={`tab ${tab===x?'active':''}`}>{x.toUpperCase()}</button>)}</div>

      {tab==='auth' && <div className="split"><div className="panel"><div className="title"><h2>Login / Register</h2></div><div className="formgrid"><input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}/><input className="input" placeholder="Discord username" value={discord} onChange={e=>setDiscord(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={signIn}>Login</button><button disabled={busy} className="btn ghost" onClick={signUp}>Create Account</button></div></div><div className="panel"><h2>Discord Verify</h2><p className="muted">Carl-bot verify-г дараа нь Discord талдаа засаж болно. Website дээр Discord username хадгална.</p><a className="btn" href={discordInvite} target="_blank">Open Discord</a></div></div>}

      {tab==='teams' && <div className="split"><div className="panel"><h2>Create Team</h2><div className="formgrid"><input className="input" placeholder="Team name" value={teamName} onChange={e=>setTeamName(e.target.value)}/><input className="input" placeholder="TAG" maxLength={5} value={teamTag} onChange={e=>setTeamTag(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={createTeam}>Create</button></div></div><div className="panel"><h2>Teams</h2><div className="list">{teams.map(t=><div className="item" key={t.id}><div><b>[{t.tag}] {t.name}</b><div className="muted">W {t.wins} / L {t.losses}</div></div><span className="pill red">Captain</span></div>)}</div></div></div>}

      {tab==='matches' && <div className="split"><div className="panel"><h2>Create Match</h2><div className="formgrid"><select className="input" value={teamA} onChange={e=>setTeamA(e.target.value)}><option value="">Team A</option>{teams.map(t=><option key={t.id} value={t.id}>{t.tag} - {t.name}</option>)}</select><select className="input" value={teamB} onChange={e=>setTeamB(e.target.value)}><option value="">Team B</option>{teams.map(t=><option key={t.id} value={t.id}>{t.tag} - {t.name}</option>)}</select><input className="input" placeholder="Room code" value={roomCode} onChange={e=>setRoomCode(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={createMatch}>Create Match</button></div></div><div className="panel"><h2>Live Matches</h2><MatchList matches={matches} teamById={teamById} submitScore={submitScore} confirmMatch={confirmMatch} disputeMatch={disputeMatch}/></div></div>}

      {tab==='leaderboard' && <div className="panel"><div className="title"><h2>Leaderboard</h2><p className="muted">Confirmed match-аас автоматаар шинэчлэгдэнэ.</p></div><div className="list">{sortedTeams.map((t,i)=><div className="item" key={t.id}><div><b>#{i+1} [{t.tag}] {t.name}</b><div className="muted">Win rate: {t.wins+t.losses ? Math.round((t.wins/(t.wins+t.losses))*100) : 0}%</div></div><div><span className="pill green">{t.wins}W</span> <span className="pill red">{t.losses}L</span></div></div>)}</div></div>}

      {tab==='admin' && <div className="panel"><div className="title"><h2>Admin Review</h2><p className="muted">Dispute болон submitted match-уудыг эндээс шалгана.</p></div><MatchList matches={matches.filter(m=>m.status!=='confirmed')} teamById={teamById} submitScore={submitScore} confirmMatch={confirmMatch} disputeMatch={disputeMatch}/></div>}
    </section>
    <footer className="footer"><div className="wrap">RedZone Arena • Next.js + Supabase • Built for tournament verification</div></footer>
    {toast && <div className="toast">{toast}</div>}
  </main>;
}

function MatchList({ matches, teamById, submitScore, confirmMatch, disputeMatch }: { matches: Match[]; teamById: Map<string, Team>; submitScore: (m: Match)=>void; confirmMatch: (m: Match)=>void; disputeMatch: (m: Match)=>void; }) {
  if (!matches.length) return <p className="muted">Одоогоор match алга.</p>;
  return <div className="list">{matches.map(m => {
    const a = teamById.get(m.team_a); const b = teamById.get(m.team_b);
    return <div className="item" key={m.id}><div><b>[{a?.tag || 'A'}] {a?.name || 'Team A'} vs [{b?.tag || 'B'}] {b?.name || 'Team B'}</b><div className="muted">Room: {m.room_code || 'TBA'} • Score: {m.score_a ?? '-'} : {m.score_b ?? '-'} • {new Date(m.created_at).toLocaleDateString()}</div></div><div className="actions"><span className={`pill ${m.status==='confirmed'?'green':m.status==='disputed'?'red':'yellow'}`}>{m.status}</span>{m.status==='open' && <button className="btn small" onClick={()=>submitScore(m)}>Submit</button>}{m.status==='submitted' && <><button className="btn small" onClick={()=>confirmMatch(m)}>Confirm</button><button className="btn small ghost" onClick={()=>disputeMatch(m)}>Dispute</button></>}{m.status==='disputed' && <button className="btn small" onClick={()=>confirmMatch(m)}>Admin Confirm</button>}</div></div>;
  })}</div>;
}
