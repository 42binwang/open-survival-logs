"""The icon subjects: each catalog `builder` composes the parametric containers, dishes and props into one item."""

from __future__ import annotations

from . import containers, dishes, props


def build(icon: dict, seed: int) -> list:
    fn = BUILDERS.get(icon["builder"])
    if fn is None:
        raise SystemExit(f"icon {icon['id']}: no builder '{icon['builder']}'")
    return fn(icon, seed + icon["id"])


def _labels(icon: dict, n: int) -> list:
    labels = icon.get("labels", [])
    if len(labels) < n:
        raise SystemExit(f"icon {icon['id']}: builder '{icon['builder']}' needs {n} label(s), catalog lists {labels}")
    return labels


BUILDERS = {
    "tin": lambda i, s: containers.tin(i["tin"], _labels(i, 1)[0], lid="ring", seed=s),
    "noodle_cup": lambda i, s: containers.cup(i["cup"], _labels(i, 1)[0], seed=s),
    "bread": lambda i, s: props.bread(i["loaf"], seed=s),
    "rice_sack": lambda i, s: containers.sack(i["sack"], _labels(i, 1)[0], seed=s),
    "water_bottle": lambda i, s: containers.bottle(i["bottle"], _labels(i, 1)[0], seed=s),
    "dish": lambda i, s: dishes.dish(i["dish"], i.get("quality", "normal"), seed=s),
    "bandage": lambda i, s: props.bandage(i["roll"], _labels(i, 1)[0], seed=s, label_turn=i["roll"].get("labelTurn", 0.0)),
    "planks": lambda i, s: props.planks(i["planks"], seed=s),
    "seed_packet": lambda i, s: containers.packet(i["packet"], _labels(i, 1)[0], seed=s),
    "mousetrap": lambda i, s: props.mousetrap(i["trap"], _labels(i, 1)[0], seed=s),
    "book": lambda i, s: props.book(i["book"], _labels(i, 1)[0], seed=s),
}
