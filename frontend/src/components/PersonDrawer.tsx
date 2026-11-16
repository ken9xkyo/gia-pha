import { History, Link2, MapPin, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useIsAdmin } from "@/api/context";
import { usePerson } from "@/api/hooks";
import type { FamilyGraph } from "@/lib/graph";
import type { Ego, Relation } from "@/lib/kinship";
import type { Rules } from "@/lib/kinshipRules";
import { birthText, deathText, gioText, LINK_KIND, STATUS, UNION_KIND, UNION_STATUS, lifeSpan } from "@/lib/format";
import { initials } from "@/lib/text";
import { KinshipCard } from "./NodeMenu";
import { Button, Drawer, Spinner } from "./ui";

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5 text-[15px]">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-stone-900">{children}</dd>
    </div>
  );
}

function PersonLink({ graph, id, onOpen, extra }: { graph: FamilyGraph; id: number; onOpen: (id: number) => void; extra?: string }) {
  const p = graph.get(id);
  if (!p) return null;
  return (
    <li>
      <button onClick={() => onOpen(id)} className="text-left font-medium text-brand-700 hover:underline">
        {p.name}
      </button>
      <span className="text-sm text-stone-500"> {[lifeSpan(p), extra].filter(Boolean).join(" · ")}</span>
    </li>
  );
}

/** Trang hồ sơ thành viên (FR-42): đủ thông tin, có liên kết tới cha mẹ, vợ/chồng, con, anh chị em. */
export function PersonDrawer({
  graph,
  rules,
  personId,
  ego,
  relation,
  shareUrl,
  onClose,
  onOpen,
  onEdit,
}: {
  graph: FamilyGraph;
  rules: Rules;
  personId: number;
  ego: Ego | null;
  relation: Relation | null;
  shareUrl: string;
  onClose: () => void;
  onOpen: (id: number) => void;
  onEdit: () => void;
}) {
  const admin = useIsAdmin();
  const { data: d, isLoading } = usePerson(personId);
  const node = graph.get(personId);
  if (!node) return null;

  const parents = [node.father, node.mother].filter((x): x is number => x != null);
  const siblings = graph.siblings(personId);

  return (
    <Drawer
      open
      onClose={onClose}
      title="Hồ sơ thành viên"
      footer={
        <>
          <Button
            icon={<Link2 className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(shareUrl);
              toast.success("Đã sao chép liên kết");
            }}
          >
            Sao chép liên kết
          </Button>
          {admin && (
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={onEdit}>
              Sửa
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-4">
        {d?.photo_url ? (
          <img src={d.photo_url} alt={node.name} className="size-24 rounded-full border-4 border-white object-cover shadow" />
        ) : (
          <div
            className={`flex size-24 items-center justify-center rounded-full text-2xl font-bold ${node.gender === "M" ? "bg-blue-100 text-blue-800" : "bg-pink-100 text-pink-800"}`}
          >
            {initials(node.name)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-stone-900">{node.name}</h3>
          <p className="text-[15px] text-stone-600">
            {[node.gen ? `Đời ${node.gen}` : null, node.gender === "M" ? "Nam" : "Nữ", !node.lineage ? (node.gender === "F" ? "Dâu" : "Rể") : null, node.ngoai ? "Dòng ngoại" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {node.branch && <p className="text-[15px] text-stone-600">Chi/phái: {node.branch}</p>}
        </div>
      </div>

      <div className="mt-4">
        <KinshipCard graph={graph} rules={rules} personId={personId} ego={ego} relation={relation} />
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {d && (
        <dl className="mt-4 divide-y divide-stone-100">
          <Row label="Tên húy">{d.ten_huy}</Row>
          <Row label="Tên tự">{d.ten_tu}</Row>
          <Row label="Tên hiệu">{d.ten_hieu}</Row>
          <Row label="Thụy hiệu">{d.thuy_hieu}</Row>
          <Row label="Thứ tự">{d.birth_order ? (d.birth_order === 1 ? "Con trưởng" : `Con thứ ${d.birth_order}`) : null}</Row>
          <Row label="Ngày sinh">{birthText(d) || null}</Row>
          <Row label="Giờ sinh">{d.birth_time}</Row>
          <Row label="Tình trạng">{STATUS[d.living_status]}</Row>
          <Row label="Ngày mất">{deathText(d) || null}</Row>
          <Row label="Ngày giỗ">{gioText(d) || null}</Row>
          <Row label="Nơi an táng">
            {d.burial_place || d.burial_lat ? (
              <span>
                {d.burial_place}
                {d.burial_lat != null && d.burial_lng != null && (
                  <a
                    className="ml-2 inline-flex items-center gap-1 text-brand-700 underline"
                    href={`https://www.google.com/maps?q=${d.burial_lat},${d.burial_lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <MapPin className="size-4" /> Bản đồ
                  </a>
                )}
              </span>
            ) : null}
          </Row>
          <Row label="Cải táng">{d.reburial_info}</Row>
          <Row label="Quê quán">{d.hometown}</Row>
          <Row label="Nơi ở">{d.residence}</Row>
          <Row label="Nghề nghiệp">{d.occupation}</Row>
          <Row label="Điện thoại">{d.phone ? <a href={`tel:${d.phone}`} className="text-brand-700 underline">{d.phone}</a> : null}</Row>
        </dl>
      )}
      {d?.biography && (
        <section className="mt-4">
          <h4 className="mb-1 font-bold text-stone-800">Tiểu sử</h4>
          <div className="prose-vi text-stone-800" dangerouslySetInnerHTML={{ __html: d.biography }} />
        </section>
      )}

      <section className="mt-5 space-y-4">
        {parents.length > 0 && (
          <div>
            <h4 className="mb-1 font-bold text-stone-800">Cha mẹ</h4>
            <ul className="space-y-1">
              {parents.map((id) => (
                <PersonLink key={id} graph={graph} id={id} onOpen={onOpen} />
              ))}
              {node.parentLink && node.parentLink.k !== "biological" && (
                <li className="text-sm text-stone-500">({LINK_KIND[node.parentLink.k]})</li>
              )}
            </ul>
          </div>
        )}
        {node.unions.length > 0 && (
          <div>
            <h4 className="mb-1 font-bold text-stone-800">{node.gender === "M" ? "Vợ" : "Chồng"} và con</h4>
            <ul className="space-y-3">
              {node.unions.map((uid) => {
                const u = graph.unions.get(uid)!;
                const sp = graph.partnerIn(uid, personId);
                return (
                  <li key={uid}>
                    <div>
                      {sp != null ? (
                        <PersonLink graph={graph} id={sp} onOpen={onOpen} extra={`${UNION_KIND[u.kind]} · ${UNION_STATUS[u.status]}`} />
                      ) : (
                        <span className="italic text-stone-500">{node.gender === "M" ? "Vợ" : "Chồng"} không rõ tên</span>
                      )}
                    </div>
                    {u.children.length > 0 && (
                      <ul className="ml-4 mt-1 space-y-1 border-l-2 border-stone-200 pl-3">
                        {u.children.map((c) => (
                          <PersonLink key={c} graph={graph} id={c} onOpen={onOpen} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {siblings.length > 0 && (
          <div>
            <h4 className="mb-1 font-bold text-stone-800">Anh chị em</h4>
            <ul className="space-y-1">
              {siblings.map((id) => (
                <PersonLink key={id} graph={graph} id={id} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {admin && (
        <Link
          to={`/admin/nhat-ky?entity=person&id=${personId}`}
          className="mt-6 inline-flex items-center gap-2 text-[15px] text-brand-700 hover:underline"
        >
          <History className="size-4" /> Xem lịch sử thay đổi
        </Link>
      )}
    </Drawer>
  );
}
