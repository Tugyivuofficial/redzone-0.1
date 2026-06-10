'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

type View = 'dashboard'|'profile'|'teams'|'matches'|'leaderboard'|'admin';
type Profile = { id:string; email:string|null; username:string|null; discord_name:string|null; standoff_id:string|null; avatar_url:string|null; role:string|null };
type Team = { id:string; name:string; tag:string; logo_url:string|null; wins:number; losses:number; created_by:string; created_at:string };
type Match = { id:string; team_a:string; team_b:string; score_a:number|null; score_b:number|null; status:string; created_by:string; created_at:string };

const DISCORD = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/yourserver';

export default function Page(){
  const [view,setView]=useState<View>('dashboard');
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [teams,setTeams]=useState<Team[]>([]);
  const [matches,setMatches]=useState<Match[]>([]);
  const [teamName,setTeamName]=useState('');
  const [teamTag,setTeamTag]=useState('');
  const [matchA,setMatchA]=useState('');
  const [matchB,setMatchB]=useState('');
  const [profileForm,setProfileForm]=useState({ username:'', discord_name:'', standoff_id:'' });

  const isAdmin = profile?.role === 'admin';
  const ranked = useMemo(()=>[...teams].sort((a,b)=>b.wins-a.wins || a.losses-b.losses),[teams]);
  const pending = matches.filter(m=>m.status==='submitted'||m.status==='disputed');

  useEffect(()=>{
    supabase.auth.getUser().then(async ({data})=>{
      setUser(data.user);
      if(data.user) await ensureProfile(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session)=>{
      setUser(session?.user ?? null);
      if(session?.user) await ensureProfile(session.user); else setProfile(null);
    });
    loadAll();
    return ()=>sub.subscription.unsubscribe();
  },[]);

  async function ensureProfile(u:User){
    const payload={id:u.id,email:u.email,username:u.email?.split('@')[0]||'player'};
    await supabase.from('profiles').upsert(payload,{onConflict:'id',ignoreDuplicates:true});
    const {data,error}=await supabase.from('profiles').select('*').eq('id',u.id).single();
    if(error){setNotice(error.message);return;}
    setProfile(data as Profile);
    setProfileForm({username:data.username||'',discord_name:data.discord_name||'',standoff_id:data.standoff_id||''});
  }

  async function loadAll(){
    const [{data:t},{data:m}]=await Promise.all([
      supabase.from('teams').select('*').order('created_at',{ascending:false}),
      supabase.from('matches').select('*').order('created_at',{ascending:false})
    ]);
    setTeams((t||[]) as Team[]); setMatches((m||[]) as Match[]);
  }

  async function signUp(){
    setLoading(true); setNotice('');
    const {data,error}=await supabase.auth.signUp({email,password});
    setLoading(false);
    if(error) return setNotice(error.message);
    if(data.user) await ensureProfile(data.user);
    setNotice('Account created. Одоо login хийгээд Profile-оо бөглөөрэй.');
  }
  async function signIn(){
    setLoading(true); setNotice('');
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    setLoading(false);
    if(error) return setNotice(error.message);
    if(data.user) await ensureProfile(data.user);
    setNotice('Logged in.'); loadAll();
  }
  async function signOut(){ await supabase.auth.signOut(); setUser(null); setProfile(null); setNotice('Logged out.'); }

  async function saveProfile(){
    if(!user) return setNotice('Эхлээд login хийнэ.');
    const {error}=await supabase.from('profiles').update(profileForm).eq('id',user.id);
    if(error) return setNotice(error.message);
    await ensureProfile(user); setNotice('Profile saved.');
  }

  async function uploadAvatar(file:File|null){
    if(!file || !user) return;
    const ext=file.name.split('.').pop()||'png';
    const path=`${user.id}/avatar-${Date.now()}.${ext}`;
    const {error}=await supabase.storage.from('avatars').upload(path,file,{upsert:true});
    if(error) return setNotice(error.message);
    const {data}=supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({avatar_url:data.publicUrl}).eq('id',user.id);
    await ensureProfile(user); setNotice('Avatar uploaded.');
  }

  async function createTeam(){
    if(!user) return setNotice('Эхлээд login хийнэ.');
    if(!teamName.trim()||!teamTag.trim()) return setNotice('Team name + tag бөглөнө.');
    const {data,error}=await supabase.from('teams').insert({name:teamName.trim(),tag:teamTag.trim().toUpperCase(),created_by:user.id}).select().single();
    if(error) return setNotice(error.message);
    await supabase.from('team_members').insert({team_id:data.id,user_id:user.id,role:'captain'});
    setTeamName(''); setTeamTag(''); setNotice('Team created.'); loadAll();
  }

  async function createMatch(){
    if(!user) return setNotice('Эхлээд login хийнэ.');
    if(!matchA||!matchB||matchA===matchB) return setNotice('2 өөр team сонго.');
    const {error}=await supabase.from('matches').insert({team_a:matchA,team_b:matchB,created_by:user.id,status:'open'});
    if(error) return setNotice(error.message);
    setMatchA(''); setMatchB(''); setNotice('Match created.'); loadAll();
  }

  async function submitScore(m:Match){
    const a=Number(prompt(`${nameOf(m.team_a)} score?`,String(m.score_a??0)));
    const b=Number(prompt(`${nameOf(m.team_b)} score?`,String(m.score_b??0)));
    if(Number.isNaN(a)||Number.isNaN(b)) return;
    const {error}=await supabase.from('matches').update({score_a:a,score_b:b,status:'submitted'}).eq('id',m.id);
    if(error) return setNotice(error.message);
    setNotice('Score submitted. Admin эсвэл opponent confirm хүлээнэ.'); loadAll();
  }

  async function confirmMatch(m:Match){
    if(!isAdmin) return setNotice('Admin эрхтэй хүн л result approve хийнэ.');
    if(m.score_a===null||m.score_b===null||m.score_a===m.score_b) return setNotice('Score буруу байна.');
    const winner=m.score_a>m.score_b?m.team_a:m.team_b;
    const loser=m.score_a>m.score_b?m.team_b:m.team_a;
    const {error}=await supabase.from('matches').update({status:'confirmed'}).eq('id',m.id);
    if(error) return setNotice(error.message);
    await supabase.rpc('add_win_loss',{winner_id:winner,loser_id:loser});
    setNotice('Approved. Leaderboard updated.'); loadAll();
  }
  async function dispute(m:Match){
    const {error}=await supabase.from('matches').update({status:'disputed'}).eq('id',m.id);
    if(error) return setNotice(error.message);
    setNotice('Dispute opened. Discord дээр screenshot шалгана.'); loadAll();
  }

  const nameOf=(id:string)=>teams.find(t=>t.id===id)?.name||'Unknown';

  return <main>
    <aside className="side">
      <div className="logo"><span>RZ</span><div><b>RedZone</b><small>Arena Pro</small></div></div>
      <Nav v="dashboard" view={view} setView={setView}>Dashboard</Nav>
      <Nav v="profile" view={view} setView={setView}>Profile</Nav>
      <Nav v="teams" view={view} setView={setView}>Teams</Nav>
      <Nav v="matches" view={view} setView={setView}>Matches</Nav>
      <Nav v="leaderboard" view={view} setView={setView}>Leaderboard</Nav>
      {isAdmin && <Nav v="admin" view={view} setView={setView}>Admin Panel</Nav>}
      <a className="discord" href={DISCORD} target="_blank">Join Discord</a>
    </aside>

    <section className="page">
      <header className="hero">
        <div><p className="eyebrow">STANDOFF 2 TOURNAMENT HUB</p><h1>{title(view)}</h1><p>Team, match, result confirm, dispute бүгд нэг цэгцтэй dashboard дээр.</p></div>
        <div className="loginBox">
          {user ? <div className="userchip"><Avatar p={profile}/><div><b>{profile?.username||user.email}</b><small>{isAdmin?'ADMIN':'PLAYER'}</small></div><button onClick={signOut}>Logout</button></div> : <><input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={loading} onClick={signIn}>Login</button><button className="ghost" disabled={loading} onClick={signUp}>Create</button></>}
        </div>
      </header>
      {notice && <div className="notice">{notice}</div>}

      {view==='dashboard' && <>
        <div className="stats"><Stat label="Teams" value={teams.length}/><Stat label="Matches" value={matches.length}/><Stat label="Pending" value={pending.length}/><Stat label="Confirmed" value={matches.filter(m=>m.status==='confirmed').length}/></div>
        <div className="two"><Panel title="Latest Matches"><MatchList matches={matches.slice(0,5)} nameOf={nameOf} submitScore={submitScore} dispute={dispute} confirmMatch={confirmMatch} isAdmin={isAdmin}/></Panel><Panel title="Top Teams"><Leaderboard teams={ranked.slice(0,5)}/></Panel></div>
      </>}

      {view==='profile' && <Panel title="My Profile"><div className="profileGrid"><div className="avatarCard"><Avatar p={profile} big/><label className="upload">Upload avatar<input type="file" accept="image/*" onChange={e=>uploadAvatar(e.target.files?.[0]||null)}/></label></div><div className="form"><label>Username<input value={profileForm.username} onChange={e=>setProfileForm({...profileForm,username:e.target.value})}/></label><label>Discord name<input value={profileForm.discord_name} onChange={e=>setProfileForm({...profileForm,discord_name:e.target.value})}/></label><label>Standoff 2 ID<input value={profileForm.standoff_id} onChange={e=>setProfileForm({...profileForm,standoff_id:e.target.value})}/></label><button onClick={saveProfile}>Save Profile</button></div></div></Panel>}

      {view==='teams' && <Panel title="Teams"><div className="toolbar"><input placeholder="Team name" value={teamName} onChange={e=>setTeamName(e.target.value)}/><input placeholder="TAG" value={teamTag} onChange={e=>setTeamTag(e.target.value)}/><button onClick={createTeam}>Create Team</button></div><TeamCards teams={teams}/></Panel>}

      {view==='matches' && <Panel title="Matches"><div className="toolbar"><select value={matchA} onChange={e=>setMatchA(e.target.value)}><option value="">Team A</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={matchB} onChange={e=>setMatchB(e.target.value)}><option value="">Team B</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button onClick={createMatch}>Create Match</button></div><MatchList matches={matches} nameOf={nameOf} submitScore={submitScore} dispute={dispute} confirmMatch={confirmMatch} isAdmin={isAdmin}/></Panel>}

      {view==='leaderboard' && <Panel title="Leaderboard"><Leaderboard teams={ranked}/></Panel>}
      {view==='admin' && isAdmin && <Panel title="Admin Panel"><p className="muted">Зөвхөн admin role-той хэрэглэгч харна. Pending result-уудыг энд approve хийнэ.</p><MatchList matches={pending} nameOf={nameOf} submitScore={submitScore} dispute={dispute} confirmMatch={confirmMatch} isAdmin={isAdmin}/></Panel>}
    </section>
  </main>;
}

function title(v:View){return ({dashboard:'Dashboard',profile:'Profile',teams:'Teams',matches:'Matches',leaderboard:'Leaderboard',admin:'Admin Panel'} as Record<View,string>)[v]}
function Nav({v,view,setView,children}:{v:View;view:View;setView:(v:View)=>void;children:React.ReactNode}){return <button className={view===v?'active':''} onClick={()=>setView(v)}>{children}</button>}
function Stat({label,value}:{label:string;value:number}){return <div className="stat"><small>{label}</small><b>{value}</b></div>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <div className="panel"><h2>{title}</h2>{children}</div>}
function Avatar({p,big}:{p:Profile|null;big?:boolean}){return <div className={big?'avatar big':'avatar'}>{p?.avatar_url?<img src={p.avatar_url} alt="avatar"/>:<span>{(p?.username||'RZ').slice(0,2).toUpperCase()}</span>}</div>}
function TeamCards({teams}:{teams:Team[]}){return <div className="teamGrid">{teams.map(t=><div className="team" key={t.id}><span>{t.tag}</span><b>{t.name}</b><small>{t.wins}W / {t.losses}L</small></div>)}</div>}
function MatchList({matches,nameOf,submitScore,dispute,confirmMatch,isAdmin}:{matches:Match[];nameOf:(id:string)=>string;submitScore:(m:Match)=>void;dispute:(m:Match)=>void;confirmMatch:(m:Match)=>void;isAdmin:boolean}){return <div className="matches">{matches.length===0&&<p className="muted">Одоогоор match байхгүй.</p>}{matches.map(m=><div className="match" key={m.id}><div><b>{nameOf(m.team_a)} <em>vs</em> {nameOf(m.team_b)}</b><small>{m.score_a??'-'} : {m.score_b??'-'} · {m.status}</small></div><div className="actions"><button onClick={()=>submitScore(m)}>Submit</button><button className="ghost" onClick={()=>dispute(m)}>Dispute</button>{isAdmin&&<button onClick={()=>confirmMatch(m)}>Approve</button>}</div></div>)}</div>}
function Leaderboard({teams}:{teams:Team[]}){return <div className="board">{teams.map((t,i)=><div className="rank" key={t.id}><strong>#{i+1}</strong><span>{t.tag}</span><b>{t.name}</b><small>{t.wins}W / {t.losses}L · {Math.round(t.wins/Math.max(1,t.wins+t.losses)*100)}%</small></div>)}</div>}
