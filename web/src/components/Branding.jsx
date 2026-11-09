import { useState } from 'react';

export function ClientArtwork() {
  const [failed, setFailed] = useState(false);
  if (failed) return <><p className="mt-3 font-serif font-bold text-3xl sm:text-5xl text-amber-100">Namma <span className="text-red-400">Honda</span> Habba</p><p className="mt-3 text-amber-100/90">One family. One grand carnival.</p></>;
  return <img src="/branding/namma-honda-habba.jpg" alt="Namma Honda Habba — One family. One grand carnival." className="mx-auto mt-4 w-full max-w-4xl rounded-xl" onError={() => setFailed(true)} />;
}

export function ProviderLogo() {
  const [failed, setFailed] = useState(false);
  return <div className="text-center"><p className="text-[10px] uppercase tracking-[.18em]">Service provider</p>{failed ? <><p className="text-xl font-extrabold tracking-tight"><span className="bg-gradient-to-r from-sky-600 to-purple-800 bg-clip-text text-transparent">Techfluence</span><span className="text-red-600">X</span></p><p className="text-[10px] tracking-widest">Innovate Beyond the X</p></> : <img src="/branding/techfluencex.jpg" alt="TechfluenceX — service provider" className="mx-auto mt-2 h-20 w-44 rounded-lg bg-white object-cover object-center" onError={() => setFailed(true)} />}</div>;
}
