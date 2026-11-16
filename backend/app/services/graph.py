"""Đồ thị gia phả trong bộ nhớ: tính đời, huyết thống, hậu duệ, tổ tiên, kế hoạch xóa.

Một cây 5.000 người chỉ vài trăm KB nên nạp toàn bộ vào bộ nhớ cho mỗi thao tác là đủ nhanh
và giúp các quy tắc toàn vẹn (PRD mục 5) được kiểm tra trên toàn cục.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Marriage, ParentLink, Person, SiteConfig

LINK_PRIORITY = {"biological": 0, "adopted": 1, "step": 2}


@dataclass
class GPerson:
    id: int
    name: str
    gender: str
    birth_year: int | None = None
    birth_order: int | None = None


@dataclass
class GUnion:
    id: int
    husband: int | None
    wife: int | None
    order_index: int = 1

    def partners(self) -> list[int]:
        return [p for p in (self.husband, self.wife) if p is not None]

    def other(self, pid: int) -> int | None:
        return self.wife if self.husband == pid else self.husband

    def slot_of(self, pid: int) -> str:
        return "husband_id" if self.husband == pid else "wife_id"


@dataclass
class GLink:
    id: int
    child: int
    union: int
    kind: str


@dataclass
class Graph:
    persons: dict[int, GPerson]
    unions: dict[int, GUnion]
    links: dict[int, GLink]
    root_id: int | None
    unions_of: dict[int, list[int]] = field(default_factory=lambda: defaultdict(list))
    children_of_union: dict[int, list[int]] = field(default_factory=lambda: defaultdict(list))
    links_of_child: dict[int, list[GLink]] = field(default_factory=lambda: defaultdict(list))

    def __post_init__(self) -> None:
        for u in self.unions.values():
            for p in u.partners():
                self.unions_of[p].append(u.id)
        for pid in self.unions_of:
            self.unions_of[pid].sort(key=lambda uid: (self.unions[uid].order_index, uid))
        for link in self.links.values():
            self.children_of_union[link.union].append(link.child)
            self.links_of_child[link.child].append(link)

    # ---- quan hệ cơ bản -------------------------------------------------
    def primary_union(self, child: int) -> int | None:
        links = self.links_of_child.get(child) or []
        if not links:
            return None
        return min(links, key=lambda lk: (LINK_PRIORITY.get(lk.kind, 9), lk.id)).union

    def parents(self, pid: int) -> tuple[int | None, int | None]:
        uid = self.primary_union(pid)
        if uid is None:
            return None, None
        u = self.unions[uid]
        return u.husband, u.wife

    def all_parents(self, pid: int) -> set[int]:
        result: set[int] = set()
        for link in self.links_of_child.get(pid, []):
            result.update(self.unions[link.union].partners())
        return result

    def children(self, pid: int) -> list[int]:
        out: list[int] = []
        for uid in self.unions_of.get(pid, []):
            out.extend(self.children_of_union.get(uid, []))
        return out

    def spouses(self, pid: int) -> list[int]:
        out = []
        for uid in self.unions_of.get(pid, []):
            other = self.unions[uid].other(pid)
            if other is not None:
                out.append(other)
        return out

    # ---- duyệt đồ thị ---------------------------------------------------
    def lineage(self) -> set[int]:
        """Những người thuộc dòng họ: thủy tổ và mọi hậu duệ (kể cả con nuôi, con riêng)."""
        if self.root_id is None or self.root_id not in self.persons:
            return set()
        seen = {self.root_id}
        queue = deque([self.root_id])
        while queue:
            pid = queue.popleft()
            for child in self.children(pid):
                if child not in seen:
                    seen.add(child)
                    queue.append(child)
        return seen

    def generations(self) -> dict[int, int]:
        """Đời: thủy tổ = 1; con = đời cha mẹ + 1; dâu/rể = đời của vợ/chồng."""
        gens: dict[int, int] = {}
        if self.root_id is None or self.root_id not in self.persons:
            return gens
        gens[self.root_id] = 1
        queue = deque([self.root_id])
        while queue:
            pid = queue.popleft()
            g = gens[pid]
            for uid in self.unions_of.get(pid, []):
                other = self.unions[uid].other(pid)
                if other is not None and other not in gens:
                    gens[other] = g
                    queue.append(other)
                for child in self.children_of_union.get(uid, []):
                    if child not in gens:
                        gens[child] = g + 1
                        queue.append(child)
        return gens

    def descendants(self, pid: int) -> set[int]:
        seen: set[int] = set()
        queue = deque([pid])
        while queue:
            cur = queue.popleft()
            for child in self.children(cur):
                if child not in seen and child != pid:
                    seen.add(child)
                    queue.append(child)
        return seen

    def ancestors(self, pid: int) -> set[int]:
        seen: set[int] = set()
        queue = deque([pid])
        while queue:
            cur = queue.popleft()
            for parent in self.all_parents(cur):
                if parent not in seen:
                    seen.add(parent)
                    queue.append(parent)
        return seen

    def would_create_cycle(self, child: int, union_id: int) -> bool:
        """Gắn `child` vào `union_id` có làm ai đó thành tổ tiên của chính mình không."""
        partners = self.unions[union_id].partners()
        if child in partners:
            return True
        desc = self.descendants(child)
        return any(p in desc for p in partners)


async def load_graph(db: AsyncSession) -> Graph:
    persons = {
        r.id: GPerson(r.id, r.full_name, r.gender, r.birth_year, r.birth_order)
        for r in (
            await db.execute(
                select(Person.id, Person.full_name, Person.gender, Person.birth_year, Person.birth_order).where(
                    Person.deleted_at.is_(None)
                )
            )
        ).all()
    }
    unions = {
        r.id: GUnion(r.id, r.husband_id, r.wife_id, r.order_index)
        for r in (
            await db.execute(
                select(Marriage.id, Marriage.husband_id, Marriage.wife_id, Marriage.order_index).where(
                    Marriage.deleted_at.is_(None)
                )
            )
        ).all()
    }
    links = {
        r.id: GLink(r.id, r.child_id, r.union_id, r.kind)
        for r in (
            await db.execute(
                select(ParentLink.id, ParentLink.child_id, ParentLink.union_id, ParentLink.kind).where(
                    ParentLink.deleted_at.is_(None)
                )
            )
        ).all()
    }
    root_id = (await db.execute(select(SiteConfig.root_person_id).where(SiteConfig.id == 1))).scalar_one_or_none()
    return Graph(persons, unions, links, root_id)


# ---- kế hoạch xóa (FR-30..34) --------------------------------------------
@dataclass
class DeletePlan:
    mode: str  # single | branch | inlaw | blocked
    person_ids: set[int] = field(default_factory=set)
    union_ids: set[int] = field(default_factory=set)
    union_slots_null: list[tuple[int, str]] = field(default_factory=list)
    link_ids: set[int] = field(default_factory=set)
    reason: str | None = None
    clears_root: bool = False

    @property
    def count(self) -> int:
        return len(self.person_ids)


def plan_delete(g: Graph, pid: int) -> DeletePlan:
    if pid not in g.persons:
        return DeletePlan("blocked", reason="Không tìm thấy thành viên")
    if pid == g.root_id and len(g.persons) > 1:
        return DeletePlan("blocked", reason="Không thể xóa thủy tổ khi cây còn thành viên khác.")

    lineage = g.lineage()
    plan = DeletePlan("single")

    if pid != g.root_id and pid not in lineage:
        # Dâu/rể: con chung được giữ, vị trí vợ/chồng chuyển thành "không rõ tên" (FR-32)
        plan.mode = "inlaw"
        plan.person_ids = {pid}
        for uid in g.unions_of.get(pid, []):
            if g.children_of_union.get(uid):
                plan.union_slots_null.append((uid, g.unions[uid].slot_of(pid)))
            else:
                plan.union_ids.add(uid)
        plan.link_ids = {lk.id for lk in g.links_of_child.get(pid, [])}
        plan.link_ids |= {lk.id for lk in g.links.values() if lk.union in plan.union_ids}
        return plan

    desc = g.descendants(pid)
    people = {pid} | desc
    plan.mode = "branch" if desc else "single"
    unions = {uid for p in people for uid in g.unions_of.get(p, [])}
    for uid in list(unions):
        for partner in g.unions[uid].partners():
            if partner in people or partner in lineage:
                continue
            if set(g.unions_of.get(partner, [])) <= unions:
                people.add(partner)
    plan.person_ids = people
    plan.union_ids = unions
    plan.link_ids = {lk.id for lk in g.links.values() if lk.child in people or lk.union in unions}
    plan.clears_root = pid == g.root_id
    return plan
