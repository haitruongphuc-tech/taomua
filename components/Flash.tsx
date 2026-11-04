export default function Flash({ sp }: { sp: { ok?: string; loi?: string } }) {
  return (
    <>
      {sp.ok && <div className="alert ok">{String(sp.ok).slice(0, 300)}</div>}
      {sp.loi && <div className="alert bad">{String(sp.loi).slice(0, 300)}</div>}
    </>
  );
}
