# Opens a .docx in headless LibreOffice, updates the table of contents (and page
# numbers) and saves it as .docx. Usage: update_toc.py <in.docx> <out.docx> <scratch-dir>
import uno, sys, time, subprocess, os
from com.sun.star.beans import PropertyValue
def pv(n,v):
    p=PropertyValue(); p.Name=n; p.Value=v; return p
src, dst, scratch = [os.path.abspath(a) for a in sys.argv[1:4]]
proc = subprocess.Popen(["soffice","--headless","--invisible","--norestore","-env:UserInstallation=file://"+scratch+"/lo-profile","--accept=socket,host=localhost,port=2002;urp;"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ctx=None
for _ in range(60):
    try:
        local=uno.getComponentContext()
        resolver=local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver",local)
        ctx=resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext"); break
    except Exception: time.sleep(1)
smgr=ctx.ServiceManager
desktop=smgr.createInstanceWithContext("com.sun.star.frame.Desktop",ctx)
doc=desktop.loadComponentFromURL("file://"+src,"_blank",0,(pv("Hidden",True),))
idx=doc.getDocumentIndexes()
print("indexes:",idx.getCount())
for i in range(idx.getCount()): idx.getByIndex(i).update()
doc.storeToURL("file://"+dst,(pv("FilterName","MS Word 2007 XML"),))
doc.close(True)
try: desktop.terminate()
except Exception: pass
proc.wait(timeout=30)
