// ==UserScript==
// @name         Bangumi日志，Markdown书写
// @namespace    https://github.com/furtherun/bangumi-blog-markdown
// @description  Markdown编辑器书写，Bangumi日志自动排版。
// @version      0.0.1
// @author       furtherun
// @match        http*://bgm.tv/blog/*/edit
// @match        http*://chii.in/blog/*/edit
// @match        http*://bangumi.tv/blog/*/edit
// @require 	 https://cdn.jsdelivr.net/npm/html-escaper@3.0.3/index.min.js
// @require      https://cdn.jsdelivr.net/npm/commonmark@0.29.3/dist/commonmark.min.js
// ==/UserScript==

var Renderer = commonmark.Renderer;
var Parser = commonmark.Parser;
var htmlescape = html.escape;

var reUnsafeProtocol = /^javascript:|vbscript:|file:|data:/i;
var reSafeDataProtocol = /^data:image\/(?:png|gif|jpeg|webp)/i;

var potentiallyUnsafe = function (url) {
    return reUnsafeProtocol.test(url) && !reSafeDataProtocol.test(url);
};

// Helper function to produce a BBCode tag.
function tag(name, attrs, selfclosing) {

    if (this.disableTags > 0) {
        return;
    }
    this.buffer += "[" + name;
    if (attrs && attrs.length > 0) {
        var i = 0;
        var attrib;
        while ((attrib = attrs[i]) !== undefined) {
            if (attrib[0] == "tag_value") {
                this.buffer += '=' + attrib[1];
            }
            else {
                this.buffer += " " + attrib[0] + '="' + attrib[1] + '"';
            }
            i++;
        }
    }
    if (selfclosing) {
        this.buffer += " /";
    }
    this.buffer += "]";
    this.lastOut = "]";

}

function BBCodeRenderer(options) {
    options = options || {};
    // 如果softbreak没有设置或者不是string，将其设置为默认值"\n"
    options.softbreak = typeof options.softbreak === 'string' ? options.softbreak : "\n";
    options.newline_after_heading = options.newline_after_heading || true;
    this.esc = options.esc || htmlescape;
    this.disableTags = 0;
    this.lastOut = "\n";
    this.options = options;
}

/* Node methods */

function text(node) {
    // 删除线，并非commonmark标准，采用自定义的方式实现
    // ~~strikethrough~~
    // str~~iketh~~rough
    var content = node.literal;
    content = content.replace(/~~(.*?)~~/g, '[s]$1[/s]');

    // this.out(content);
    this.lit(content);
}

function softbreak() {
    this.lit(this.options.softbreak);
}

function linebreak() {
    this.cr();
}

function link(node, entering) {
    var attrs = this.attrs(node);
    if (entering) {
        if (!(this.options.safe && potentiallyUnsafe(node.destination))) {
            this.tag("url=" + this.esc(node.destination));
        }
        if (node.title) {
            this.text(node.title);
        }
    } else {
        this.tag("/url");
    }
}

// 图片，bbcode的图片和html的图片处理区别较大，html的image alt固定放在标签中间不显示，
// 而这里似乎不能删掉image alt，所以计划把image alt显示在图片上面，image alt是可选项。
// title是鼠标悬浮图片时的提示信息，必须用双引号包裹，也是可选项，bbcode中直接舍弃。
// ![image alt](link "title")
function image(node, entering) {
    if (entering) {
        if (this.disableTags === 0) {
            this.cr();
        }
        this.disableTags += 1;
    } else {
        this.disableTags -= 1;
        if (this.disableTags === 0) {
            if (this.options.safe && potentiallyUnsafe(node.destination)) {
                return;
            }
            this.cr();
            this.lit('[img]' + this.esc(node.destination) + '[/img]');
        }
    }
}

function emph(node, entering) {
    this.tag(entering ? "i" : "/i");
}

function strong(node, entering) {
    this.tag(entering ? "b" : "/b");
}

function paragraph(node, entering) {
    var grandparent = node.parent.parent;
    var attrs = this.attrs(node);
    if (grandparent !== null && grandparent.type === "list") {
        if (grandparent.listTight) {
            return;
        }
    }

    if (entering) {
        if (this.options.softbreak === ' ' || this.options.softbreak === '') {
            this.lit("\n");
        }
        this.softbreak();
    } else {
        if (this.options.softbreak === ' ' || this.options.softbreak === '') {
            this.lit("\n");
        }
        this.softbreak();
    }
}

// 标题，一级标题24，二级标题22，三级标题20，正文16
// # heading 1
// ## heading 2
// ### heading 3
function heading(node, entering) {
    var starting_size = 26;
    if (entering) {
        if (this.options.softbreak === ' ' || this.options.softbreak === '') {
            this.lit("\n");
        }
        this.softbreak();
        this.tag('b');
        this.tag("size=" + (starting_size - node.level * 2));
    } else {
        this.tag("/size");
        this.tag('/b');
        this.softbreak();
        if (this.options.newline_after_heading) {
            this.linebreak()
        }
    }
}

// 行内代码，采用更改字体颜色的方式实现
// `code`
function code(node) {
    var attrs = this.attrs(node);
    attrs.push(["tag_value", "crimson"]);
    this.tag("size", [['tag_value', '15']]);
    this.tag("color", attrs);
    this.tag("b");
    this.out(node.literal);
    this.tag("/b");
    this.tag("/color");
    this.tag("/size");
}

// 代码块
// ```javascript
// code block
// console.log('hello world');
// ```
function code_block(node) {
    if (this.options.softbreak === ' ' || this.options.softbreak === '') {
        this.lit("\n");
    }

    this.tag("code");
    // this.out(node.literal);
    this.lit(node.literal);
    this.tag("/code");

    // if (this.options.softbreak === ' ' || this.options.softbreak === '') {
    //     this.lit("\n");
    // }
}

// 三种分割线，使用75个“_”进行模拟
// ---
// ***
// ___
function thematic_break(node) {
    var attrs = this.attrs(node);
    this.cr();
    this.out('\n___________________________________________________________________________\n');
    this.cr();
}

function block_quote(node, entering) {
    var attrs = this.attrs(node);
    if (entering) {
        this.cr();
        this.tag("quote", attrs);
        this.cr();
    } else {
        this.cr();
        this.tag("/quote");
        this.cr();
    }
}

// 列表，有序、无序列表都只用"-"表示，且不支持多级列表
// - item1
// - item2
// - item3
function list(node, entering) {
    var attrs = this.attrs(node);
    if (node.listType === "ordered") {
        attrs.push(["tag_value", 1]);
    }
    if (entering) {
        var start = node.listStart;
        if (start !== null && start !== 1) {
            attrs.push(["start", start.toString()]);
        }
        this.softbreak();
        this.tag("list", attrs);
        this.cr();
    } else {
        this.cr();
        this.tag("/list");
        this.cr();
    }
}

function item(node, entering) {
    var attrs = this.attrs(node);
    if (entering) {
        this.tag("*", attrs);
        this.out("- ");
    } else {
        this.cr();
    }
}

function html_inline(node) {
    if (this.options.safe) {
        this.lit("<!-- raw HTML omitted -->");
    } else {
        var content = node.literal;
        // 添加新的替换规则
        content = content.replace(/<!--[\s\S]*?-->/g, ''); // html注释
        content = content.replace(/<mask>/g, "[mask]").replace(/\s*<\/mask>/g, "[/mask]");
        content = content.replace(/<u>/g, "[u]").replace(/<\/u>/g, "[/u]");
        this.lit(content);
    }
}

function html_block(node) {
    this.cr();
    if (this.options.safe) {
        this.lit("<!-- raw HTML omitted -->");
    } else {
        var content = node.literal;
        content = content.replace(/<!--[\s\S]*?-->/g, ''); // html注释
        // 修改正则表达式，使其能够匹配没有summary标签的details元素
        var detailsPattern = /<details>\s*(?:<summary>([\s\S]*?)<\/summary>)?\s*([\s\S]*?)<\/details>/g;
        var replacedContent = content.replace(detailsPattern, function (match, summary, text) {
            summary = summary || ''; // 如果summary不存在，将其设置为空字符串
            var separator = summary.endsWith('  ') ? '\n' : ' ';
            // details中的换行
            text = text.replace(/[\t\n\r\f\v]+/g, ' ').replace(/ {2,}/g, '\n').replace(/ /g, '');
            return `\n[color=yellowgreen]${summary.trim()}[/color]${separator}[mask]${text.trim()}[/mask]\n`;
        });
        this.lit(replacedContent);
    }
    this.cr();
}

function custom_inline(node, entering) {
    if (entering && node.onEnter) {
        this.lit(node.onEnter);
    } else if (!entering && node.onExit) {
        this.lit(node.onExit);
    }
}

function custom_block(node, entering) {
    this.cr();
    if (entering && node.onEnter) {
        this.lit(node.onEnter);
    } else if (!entering && node.onExit) {
        this.lit(node.onExit);
    }
    this.cr();
}

/* Helper methods */

function out(s) {
    this.lit(this.esc(s));
}

function attrs(node) {
    var att = [];
    if (this.options.sourcepos) {
        var pos = node.sourcepos;
        if (pos) {
            att.push([
                "data-sourcepos",
                String(pos[0][0]) +
                ":" +
                String(pos[0][1]) +
                "-" +
                String(pos[1][0]) +
                ":" +
                String(pos[1][1])
            ]);
        }
    }
    return att;
}

// quick browser-compatible inheritance
BBCodeRenderer.prototype = Object.create(Renderer.prototype);
BBCodeRenderer.prototype.text = text;
BBCodeRenderer.prototype.html_inline = html_inline;
BBCodeRenderer.prototype.html_block = html_block;
BBCodeRenderer.prototype.softbreak = softbreak;
BBCodeRenderer.prototype.linebreak = linebreak;
BBCodeRenderer.prototype.link = link;
BBCodeRenderer.prototype.image = image;
BBCodeRenderer.prototype.emph = emph;
BBCodeRenderer.prototype.strong = strong;
BBCodeRenderer.prototype.paragraph = paragraph;
BBCodeRenderer.prototype.heading = heading;
BBCodeRenderer.prototype.code = code;
BBCodeRenderer.prototype.code_block = code_block;
BBCodeRenderer.prototype.thematic_break = thematic_break;
BBCodeRenderer.prototype.block_quote = block_quote;
BBCodeRenderer.prototype.list = list;
BBCodeRenderer.prototype.item = item;
BBCodeRenderer.prototype.custom_inline = custom_inline;
BBCodeRenderer.prototype.custom_block = custom_block;
BBCodeRenderer.prototype.esc = htmlescape;
BBCodeRenderer.prototype.out = out;
BBCodeRenderer.prototype.tag = tag;
BBCodeRenderer.prototype.attrs = attrs;

$(function () {
    var bbTextarea = $('#tpc_content');
    var mdTextarea = $('<textarea>', {
        id: 'tpc_md_content',
        name: 'md_content',
        cols: '45',
        rows: '15',
        css: {
            width: '550px'
        },
        placeholder: "请将markdown源代码粘贴在这里……\n\n点击工具栏“md2bb”按钮进行格式转换，转换结果自动替换到编辑区。",
        class: "quick newBlogEntry loadEditor markItUpEditor valid"
    }).insertAfter(bbTextarea);

    var md2bb_btn = $('<a>', {
        text: 'md2bb',
        title: '将markdown转换为bbcode',
        css: {
            cursor: 'pointer'
        },
        click: function (event) {
            event.preventDefault();
            var markdown = mdTextarea.val();
            // console.log(markdown);

            var reader = new Parser();
            var parsed = reader.parse(markdown);

            var writer = new BBCodeRenderer({ softbreak: '' });
            var result = writer.render(parsed);
            // console.log(result);

            bbTextarea.val(result);
        }
    });

    var li = $('<li>').append(md2bb_btn);
    $('.markItUpHeader').append(li);
});