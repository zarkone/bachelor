SRCTEX = source-code.tex

all: build run
run: 
	okular vkr-templ.pdf

build:
	xelatex -interaction nonstopmode \
	-halt-on-error	 \
	-file-line-error \
	-shell-escape vkr-templ.tex


resource: svg-to-latex sources doc-tex

svg-to-latex:
	mkdir -p out/svg
	for file in `ls svg/*.svg` ; do \
		inkscape $$file --export-pdf=out/$$file.pdf --export-latex ; \
	done


sources:
	rm $(SRCTEX) -f

	echo "\\\append{Код программного продукта}" >> $(SRCTEX)

	for file in `ls src/*clj` ; do \
		echo "\\\flushright{ \\\itshape $$file }" >> $(SRCTEX) ; \
		echo "\\\clojurecodeinput{$$file}" >> $(SRCTEX) ; \
	done

doc-tex:
	pandoc -o doc.tex doc/core.html

clean:
	rm -f *.aux *.log *.out *.pdf *.pyg *.toc

.PHONY: run build clean
