import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";

function Tool({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={on}
      className={clsx("inline-flex size-9 items-center justify-center rounded-md hover:bg-stone-200", active && "bg-stone-300")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, allowImages }: { editor: Editor; allowImages: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const { url } = await api<{ url: string }>("POST", "/api/admin/uploads", form);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-stone-200 bg-stone-50 p-1 [&_svg]:size-4">
      <Tool label="Đậm" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold /></Tool>
      <Tool label="Nghiêng" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Tiêu đề lớn" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
      <Tool label="Tiêu đề nhỏ" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
      <Tool label="Danh sách" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List /></Tool>
      <Tool label="Danh sách số" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool label="Trích dẫn" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote /></Tool>
      <Tool label="Đường kẻ" on={() => c().setHorizontalRule().run()}><Minus /></Tool>
      <Tool label="Căn trái" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}><AlignLeft /></Tool>
      <Tool label="Căn giữa" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}><AlignCenter /></Tool>
      <Tool
        label="Liên kết"
        active={editor.isActive("link")}
        on={() => {
          const url = window.prompt("Địa chỉ liên kết (https://…)", editor.getAttributes("link").href ?? "https://");
          if (url === null) return;
          if (!url) c().unsetLink().run();
          else c().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 />
      </Tool>
      {allowImages && (
        <>
          <Tool label="Chèn ảnh" on={() => fileRef.current?.click()}><ImagePlus /></Tool>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </>
      )}
      <span className="flex-1" />
      <Tool label="Hoàn tác" on={() => c().undo().run()}><Undo2 /></Tool>
      <Tool label="Làm lại" on={() => c().redo().run()}><Redo2 /></Tool>
    </div>
  );
}

export function RichEditor({
  value,
  onChange,
  allowImages = true,
  placeholder,
  minHeight = "12rem",
}: {
  value: string;
  onChange: (html: string) => void;
  allowImages?: boolean;
  placeholder?: string;
  minHeight?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "prose-vi px-4 py-3", "data-placeholder": placeholder ?? "" },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML()) editor.commands.setContent(value || "", false);
  }, [value, editor]);

  if (!editor) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-stone-300 bg-white focus-within:border-brand-700">
      <Toolbar editor={editor} allowImages={allowImages} />
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
