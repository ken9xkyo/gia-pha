"""Làm sạch HTML văn bản có định dạng (tiểu sử, phả ký) để chống XSS."""

import nh3

_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li",
    "blockquote", "a", "img", "hr", "code", "pre", "span", "figure", "figcaption",
}
_ATTRS = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "p": {"style"},
    "h2": {"style"},
    "h3": {"style"},
    "h4": {"style"},
}


def _attribute_filter(tag: str, attr: str, value: str) -> str | None:
    if tag == "img" and attr == "src":
        if value.startswith("/media/") or value.startswith("https://"):
            return value
        return None
    if attr == "style":
        allowed = {"text-align: left", "text-align: center", "text-align: right", "text-align: justify"}
        cleaned = value.strip().rstrip(";").strip()
        return f"{cleaned};" if cleaned in allowed else None
    if tag == "a" and attr == "target":
        return "_blank" if value == "_blank" else None
    return value


def clean_html(html: str | None) -> str | None:
    if html is None:
        return None
    html = html.strip()
    if not html:
        return None
    return nh3.clean(
        html,
        tags=_TAGS,
        attributes=_ATTRS,
        url_schemes={"http", "https", "mailto", "tel"},
        link_rel="noopener noreferrer",
        attribute_filter=_attribute_filter,
    )
