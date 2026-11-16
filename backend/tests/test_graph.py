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


def build_network() -> Graph:
    # Cây build() + nhà thông gia của dâu 5: cha 30 + mẹ 31 → 5, 32 (em gái dâu)
    # 32 lấy chồng 33 (người ngoài) → 34; 40 là người nhập dở chưa nối vào đâu
    g = build()
    persons = dict(g.persons)
    for i, gender in [(30, "M"), (31, "F"), (32, "F"), (33, "M"), (34, "M"), (40, "M")]:
        persons[i] = GPerson(i, f"P{i}", gender)
    unions = {**g.unions, 13: GUnion(13, 30, 31), 14: GUnion(14, 33, 32)}
    links = {**g.links, 24: GLink(24, 5, 13, "biological"), 25: GLink(25, 32, 13, "biological"),
             26: GLink(26, 34, 14, "biological")}
    return Graph(persons, unions, links, root_id=1)


def test_connected_and_categories():
    g = build_network()
    assert g.connected() == set(g.persons) - {40}
    cats = g.categories()
    assert cats[1] == "lineage" and cats[5] == "inlaw" and cats[7] == "inlaw"
    assert {p for p, c in cats.items() if c == "extended"} == {30, 31, 32, 33, 34}
    assert cats[40] == "orphan"
    # nhà thông gia không được tính là đời trong dòng họ
    assert 30 not in g.generations()


def test_delete_inlaw_takes_detached_family():
    plan = plan_delete(build_network(), 5)
    assert plan.mode == "inlaw"
    assert plan.detached == {30, 31, 32, 33, 34}
    assert plan.person_ids == {5, 30, 31, 32, 33, 34}
    assert plan.union_slots_null == [(11, "wife_id")]
    assert plan.union_ids == {13, 14}
    assert plan.link_ids == {24, 25, 26}


def test_delete_branch_takes_inlaw_family():
    plan = plan_delete(build_network(), 3)
    assert plan.person_ids == {3, 5, 6, 30, 31, 32, 33, 34}
    assert 40 not in plan.person_ids


def test_delete_extended_parent_keeps_rest():
    g = build_network()
    plan = plan_delete(g, 30)
    assert plan.mode == "inlaw"
    assert plan.person_ids == {30}
    assert plan.union_slots_null == [(13, "husband_id")]
    assert not plan.detached


def test_inlaw_family_shared_by_two_branches_is_kept():
    # 32 (em gái dâu 5) lấy luôn 6 (con trai 3) thay vì người ngoài → vẫn nối qua 6
    g = build_network()
    g = Graph(dict(g.persons), {**g.unions, 14: GUnion(14, 6, 32)}, dict(g.links), root_id=1)
    plan = plan_delete(g, 5)
    assert plan.person_ids == {5}
