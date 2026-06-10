'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, hasSupabaseEnv } from '@/lib/supabase';
import { Swords, ShieldCheck, LogOut, UserRound, Trophy, PlusCircle } from 'lucide-react';

type Profile = { id: string; username: string; discord: string | null; role: string };
type Team = { id: string; name: string; tag: string; captain_id: string; wins: number; losses: number };
type Match = { id: string; team_a: string; team_b: string; room_code: string | null; score_a: number | null; score_b: number | null; status: string; winner_team: string | null; submitted_by: string | null; confirmed_by: string | null; created_at: string };

const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/yourserver';

export default function Home() {
  const [tab, setTab] = useState('home');
  const [user, setUser] = useState<User | null>(null);
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
  const sortedTeams = useMemo(() => [...teams].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)), [teams]);
  const myTeams = useMemo(() => teams.filter(t => profile?.id && t.captain_id === profile.id), [teams, profile]);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  }

  async function ensureProfile(currentUser: User): Promise<Profile | null> {
    if (!supabase) return null;
    const { data: existing, error: readErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (existing && !readErr) {
      setProfile(existing as Profile);
      return existing as Profile;
    }

    const fallbackName =
      username.trim() ||
      (currentUser.user_metadata?.username as string | undefined) ||
      currentUser.email?.split('@')[0] ||
      `player_${currentUser.id.slice(0, 6)}`;

    const profileRow = {
      id: currentUser.id,
      username: fallbackName.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 24),
      discord: discord.trim() || (currentUser.user_metadata?.discord as string | undefined) || null,
      role: 'player'
    };

    const { data: created, error } = await supabase
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      notify(`Profile үүсгэхэд алдаа: ${error.message}`);
      return null;
    }
    setProfile(created as Profile);
    return created as Profile;
  }

  async function load() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const currentUser = auth.user;
    setUser(currentUser ?? null);
    if (currentUser) await ensureProfile(currentUser);
    else setProfile(null);

    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from('teams').select('*').order('wins', { ascending: false }),
      supabase.from('matches').select('*').order('created_at', { ascending: false })
    ]);
    setTeams((t || []) as Team[]);
    setMatches((m || []) as Match[]);
  }

  async function requireProfile() {
    if (!supabase) { notify('Supabase env тохируулаагүй байна.'); return null; }
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setTab('auth'); notify('Эхлээд login хийнэ.'); return null; }
    setUser(data.user);
    return profile || await ensureProfile(data.user);
  }

  useEffect(() => {
    load();
    const client = supabase;
    if (!client) return;
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      load();
    });
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim(), discord: discord.trim() } }
    });
    setBusy(false);
    if (error) return notify(error.message);
    if (data.user) await ensureProfile(data.user);
    notify('Account үүслээ. Одоо Team үүсгэж болно.');
    setTab('teams');
    load();
  }

  async function signIn() {
    if (!supabase) return notify('Supabase env тохируулаагүй байна.');
    if (!email || !password) return notify('Email/password бөглөнө үү.');
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return notify(error.message);
    if (data.user) await ensureProfile(data.user);
    notify('Logged in. Team үүсгэж болно.');
    setTab('teams');
    load();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null); setProfile(null); notify('Logged out.'); setTab('home');
  }

  async function createTeam() {
    const p = await requireProfile();
    if (!supabase || !p) return;
    if (!teamName.trim() || !teamTag.trim()) return notify('Team name/tag бөглөнө үү.');
    setBusy(true);
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: teamName.trim(), tag: teamTag.trim().toUpperCase(), captain_id: p.id })
      .select('*')
      .single();
    if (error) { setBusy(false); return notify(error.message); }
    await supabase.from('team_members').insert({ team_id: data.id, profile_id: p.id, member_role: 'captain' });
    setTeamName(''); setTeamTag(''); setBusy(false); notify('Team үүслээ.'); load();
  }

  async function createMatch() {
    const p = await requireProfile();
    if (!supabase || !p) return;
    if (!teamA || !teamB || teamA === teamB) return notify('2 өөр team сонгоно уу.');
    setBusy(true);
    const { error } = await supabase.from('matches').insert({ team_a: teamA, team_b: teamB, room_code: roomCode || null });
    setBusy(false);
    if (error) return notify(error.message);
    setRoomCode(''); notify('Match үүслээ.'); load();
  }

  async function submitScore(match: Match) {
    const p = await requireProfile();
    if (!supabase || !p) return;
    const scoreA = Number(prompt(`${teamById.get(match.team_a)?.tag || 'Team A'} score:`));
    const scoreB = Number(prompt(`${teamById.get(match.team_b)?.tag || 'Team B'} score:`));
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB) return notify('Score буруу байна. Тэнцээ байж болохгүй.');
    const winner = scoreA > scoreB ? match.team_a : match.team_b;
    const { error } = await supabase.from('matches').update({ score_a: scoreA, score_b: scoreB, winner_team: winner, submitted_by: p.id, status: 'submitted' }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Score илгээгдлээ. Нөгөө тал Confirm/Dispute хийнэ.'); load();
  }

  async function confirmMatch(match: Match) {
    const p = await requireProfile();
    if (!supabase || !p) return;
    if (!match.winner_team) return notify('Эхлээд score submit хийнэ.');
    const { error } = await supabase.from('matches').update({ status: 'confirmed', confirmed_by: p.id }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Match confirmed. Leaderboard шинэчлэгдлээ.'); load();
  }

  async function disputeMatch(match: Match) {
    const p = await requireProfile();
    if (!supabase || !p) return;
    const { error } = await supabase.from('matches').update({ status: 'disputed' }).eq('id', match.id);
    if (error) return notify(error.message);
    notify('Dispute үүслээ. Admin Discord дээр шалгана.'); load();
  }

  return <main className="bg">
    <nav className="nav"><div className="wrap navin">
      <button className="brand navbrand" onClick={() => setTab('home')}><div className="logo"><Swords size={22}/></div><span>REDZONE ARENA</span></button>
      <div className="navlinks">
        {['home','teams','matches','leaderboard','admin'].map(x => <button key={x} className={tab === x ? 'navactive' : ''} onClick={() => setTab(x)}>{x.toUpperCase()}</button>)}
        <a href={discordInvite} target="_blank">DISCORD</a>
        {user ? <button className="btn small ghost" onClick={signOut}><LogOut size={14}/> Logout</button> : <button className="btn small" onClick={() => setTab('auth')}>LOGIN</button>}
      </div>
    </div></nav>

    {tab === 'home' && <section className="wrap hero">
      <div>
        <div className="badge"><ShieldCheck size={16}/> Discord verify + match confirm system</div>
        <h1>Standoff 2 <span className="grad">Arena</span></h1>
        <p className="lead">Team үүсгэнэ, match зарлана, score submit хийнэ. Нөгөө тал confirm хийвэл leaderboard автоматаар шинэчлэгдэнэ. Маргаан гарвал dispute болж admin шалгана.</p>
        <div className="actions"><button className="btn" onClick={() => setTab(user ? 'matches' : 'auth')}>Start</button><a className="btn ghost" href={discordInvite} target="_blank">Join Discord</a></div>
      </div>
      <div className="panel">
        {!hasSupabaseEnv && <div className="card warn"><b>Supabase env хэрэгтэй</b><p className="muted">Vercel Environment Variables дээр NEXT_PUBLIC_SUPABASE_URL болон NEXT_PUBLIC_SUPABASE_ANON_KEY нэмнэ.</p></div>}
        <div className="grid">
          <div className="card stat"><b>{teams.length}</b><span>Teams</span></div>
          <div className="card stat"><b>{matches.length}</b><span>Matches</span></div>
          <div className="card stat"><b>{matches.filter(m=>m.status==='confirmed').length}</b><span>Confirmed</span></div>
        </div>
        <div className="card"><b>{profile ? `Logged in: ${profile.username}` : 'Not logged in'}</b><p className="muted">{profile?.discord || 'Login/Register хийгээд эхэлнэ.'}</p></div>
      </div>
    </section>}

    <section className="wrap section">
      {tab !== 'home' && <div className="tabs">{['auth','teams','matches','leaderboard','admin'].map(x => <button key={x} onClick={() => setTab(x)} className={`tab ${tab===x?'active':''}`}>{x.toUpperCase()}</button>)}</div>}

      {tab==='auth' && <div className="split"><div className="panel"><div className="title"><h2><UserRound size={26}/> Login / Register</h2></div><div className="formgrid"><input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}/><input className="input" placeholder="Discord username" value={discord} onChange={e=>setDiscord(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={signIn}>Login</button><button disabled={busy} className="btn ghost" onClick={signUp}>Create Account</button></div></div><div className="panel"><h2>Account status</h2><p className="muted">{user ? 'Чи login хийсэн байна. Team үүсгэх боломжтой.' : 'Эхлээд account үүсгээд эсвэл login хийгээрэй.'}</p><button className="btn ghost" onClick={() => setTab('teams')}>Go Teams</button></div></div>}

      {tab==='teams' && <div className="split"><div className="panel"><h2><PlusCircle size={24}/> Create Team</h2><p className="muted">Login хийсэн account team captain болно.</p><div className="formgrid"><input className="input" placeholder="Team name" value={teamName} onChange={e=>setTeamName(e.target.value)}/><input className="input" placeholder="TAG" maxLength={5} value={teamTag} onChange={e=>setTeamTag(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={createTeam}>Create Team</button>{!user && <button className="btn ghost" onClick={() => setTab('auth')}>Login first</button>}</div></div><div className="panel"><h2>Teams</h2><div className="list">{teams.length ? teams.map(t=><div className="item" key={t.id}><div><b>[{t.tag}] {t.name}</b><div className="muted">W {t.wins} / L {t.losses}</div></div><span className={`pill ${myTeams.some(mt=>mt.id===t.id)?'green':'red'}`}>{myTeams.some(mt=>mt.id===t.id)?'My team':'Team'}</span></div>) : <p className="muted">Team алга. Эхний team-ээ үүсгэ.</p>}</div></div></div>}

      {tab==='matches' && <div className="split"><div className="panel"><h2>Create Match</h2><p className="muted">Team A/B сонгоод room code оруулна.</p><div className="formgrid"><select className="input" value={teamA} onChange={e=>setTeamA(e.target.value)}><option value="">Team A</option>{teams.map(t=><option key={t.id} value={t.id}>{t.tag} - {t.name}</option>)}</select><select className="input" value={teamB} onChange={e=>setTeamB(e.target.value)}><option value="">Team B</option>{teams.map(t=><option key={t.id} value={t.id}>{t.tag} - {t.name}</option>)}</select><input className="input" placeholder="Room code" value={roomCode} onChange={e=>setRoomCode(e.target.value)}/></div><div className="actions"><button disabled={busy} className="btn" onClick={createMatch}>Create Match</button></div></div><div className="panel"><h2>Live Matches</h2><MatchList matches={matches} teamById={teamById} submitScore={submitScore} confirmMatch={confirmMatch} disputeMatch={disputeMatch}/></div></div>}

      {tab==='leaderboard' && <div className="panel"><div className="title"><h2><Trophy size={28}/> Leaderboard</h2><p className="muted">Confirmed match-аас автоматаар шинэчлэгдэнэ.</p></div><div className="list">{sortedTeams.length ? sortedTeams.map((t,i)=><div className="item" key={t.id}><div><b>#{i+1} [{t.tag}] {t.name}</b><div className="muted">Win rate: {t.wins+t.losses ? Math.round((t.wins/(t.wins+t.losses))*100) : 0}%</div></div><div><span className="pill green">{t.wins}W</span> <span className="pill red">{t.losses}L</span></div></div>) : <p className="muted">Leaderboard хоосон байна.</p>}</div></div>}

      {tab==='admin' && <div className="panel"><div className="title"><h2>Admin Review</h2><p className="muted">Submitted / disputed match-уудыг эндээс confirm хийж болно.</p></div><MatchList matches={matches.filter(m=>m.status!=='confirmed')} teamById={teamById} submitScore={submitScore} confirmMatch={confirmMatch} disputeMatch={disputeMatch}/></div>}
    </section>
    <footer className="footer"><div className="wrap">RedZone Arena • Next.js + Supabase • Tournament verification system</div></footer>
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
