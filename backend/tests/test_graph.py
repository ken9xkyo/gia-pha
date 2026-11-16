from app.services.graph import GLink, GPerson, Graph, GUnion, plan_delete


def build() -> Graph:
    # 1 (tổ) + 2 (vợ) → 3 (con trai), 4 (con gái)
    # 3 + 5 (dâu) → 6 ; 4 + 7 (rể) → 8 (cháu ngoại)
    persons = {i: GPerson(i, f"P{i}", g) for i, g in
               [(1, "M"), (2, "F"), (3, "M"), (4, "F"), (5, "F"), (6, "M"), (7, "M"), (8, "F")]}
    unions = {10: GUnion(10, 1, 2), 11: GUnion(11, 3, 5), 12: GUnion(12, 7, 4)}
    links = {20: GLink(20, 3, 10, "biological"), 21: GLink(21, 4, 10, "biological"),
             22: GLink(22, 6, 11, "biological"), 23: GLink(23, 8, 12, "biological")}
    return Graph(persons, unions, links, root_id=1)


def test_generations_and_lineage():
    g = build()
    gens = g.generations()
    assert gens == {1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 7: 2, 6: 3, 8: 3}
    assert g.lineage() == {1, 3, 4, 6, 8}


def test_ancestors_and_cycle():
    g = build()
    assert g.ancestors(6) == {3, 5, 1, 2}
    assert g.would_create_cycle(3, 11)  # 3 là chồng trong union 11
    assert g.would_create_cycle(1, 11)  # 3 là hậu duệ của 1


def test_delete_root_blocked():
    assert plan_delete(build(), 1).mode == "blocked"


def test_delete_branch_includes_inlaws():
    plan = plan_delete(build(), 3)
    assert plan.mode == "branch"
    assert plan.person_ids == {3, 5, 6}
    assert plan.union_ids == {11}
    assert plan.link_ids == {20, 22}


def test_delete_leaf():
    plan = plan_delete(build(), 8)
    assert plan.mode == "single"
    assert plan.person_ids == {8}


def test_delete_inlaw_with_children_keeps_children():
    plan = plan_delete(build(), 7)
    assert plan.mode == "inlaw"
    assert plan.person_ids == {7}
    assert plan.union_slots_null == [(12, "husband_id")]
    assert not plan.union_ids
