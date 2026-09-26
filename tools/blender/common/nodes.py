"""Node-tree helpers: terse node creation and linking, node groups with typed sockets."""

from __future__ import annotations

import bpy


class Tree:
    """Wraps a node tree: t.node('ShaderNodeMath', operation='MULTIPLY', inputs={1: 0.5}); t.link(a, 'Value', b, 0)."""

    def __init__(self, nt: bpy.types.NodeTree):
        self.nt = nt
        self._x = 0

    def node(self, kind: str, label: str | None = None, inputs: dict | None = None, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self._x, 0)
        self._x += 220
        if label:
            n.label = label
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (inputs or {}).items():
            n.inputs[k].default_value = v
        return n

    def link(self, a, out, b, inp):
        src = a.outputs[out] if not hasattr(out, "is_output") else out
        dst = b.inputs[inp] if not hasattr(inp, "is_output") else inp
        return self.nt.links.new(src, dst)

    def math(self, op: str, a=None, b=None, clamp: bool = False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = float(v)
            else:
                self.nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    def mix_color(self, fac, a, b, blend: str = "MIX"):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        self._set(n.inputs[0], fac)
        self._set(n.inputs[6], a)
        self._set(n.inputs[7], b)
        return n.outputs[2]

    def mix_float(self, fac, a, b):
        n = self.node("ShaderNodeMix", data_type="FLOAT")
        self._set(n.inputs[0], fac)
        self._set(n.inputs[2], a)
        self._set(n.inputs[3], b)
        return n.outputs[0]

    def map_range(self, value, from_min, from_max, to_min=0.0, to_max=1.0, smooth: bool = True):
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR", clamp=True)
        self._set(n.inputs["Value"], value)
        for name, v in (("From Min", from_min), ("From Max", from_max), ("To Min", to_min), ("To Max", to_max)):
            self._set(n.inputs[name], v)
        return n.outputs["Result"]

    def _set(self, socket, v):
        if v is None:
            return
        if hasattr(v, "is_output"):
            self.nt.links.new(v, socket)
        elif isinstance(v, (tuple, list)):
            socket.default_value = tuple(v) if len(v) == len(socket.default_value) else (*v, 1.0)
        else:
            socket.default_value = v


def new_material(name: str) -> tuple[bpy.types.Material, bpy.types.NodeTree]:
    """A material with an empty node tree (Blender 5 always gives materials a tree; older versions need use_nodes)."""
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    return mat, mat.node_tree


def group(name: str, inputs: list[tuple[str, str, object]], outputs: list[tuple[str, str]]) -> tuple[bpy.types.NodeTree, object, object]:
    """Creates (or clears) a shader node group; returns (tree, group-input node, group-output node).

    inputs: [(name, socket type e.g. 'NodeSocketFloat', default)], outputs: [(name, socket type)].
    """
    ng = bpy.data.node_groups.get(name)
    if ng:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    for n, kind, default in inputs:
        s = ng.interface.new_socket(n, in_out="INPUT", socket_type=kind)
        if default is not None and hasattr(s, "default_value"):
            s.default_value = default
    for n, kind in outputs:
        ng.interface.new_socket(n, in_out="OUTPUT", socket_type=kind)
    gin = ng.nodes.new("NodeGroupInput")
    gout = ng.nodes.new("NodeGroupOutput")
    return ng, gin, gout
