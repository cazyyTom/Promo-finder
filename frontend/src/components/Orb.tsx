export function Orb() {
  return (
    <div className="orb-scene" aria-hidden="true">
      <div className="orb-halo" />
      <div className="orb">
        <div className="orb-core" />
        <div className="orb-ring orb-ring-one" />
        <div className="orb-ring orb-ring-two" />
        <div className="orb-ring orb-ring-three" />
        <div className="orb-sheen" />
      </div>
      <span className="orb-particle p-one" />
      <span className="orb-particle p-two" />
    </div>
  );
}
