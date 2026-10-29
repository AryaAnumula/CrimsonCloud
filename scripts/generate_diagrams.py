"""Regenerate SVG/PDF diagrams with Graphviz; Python + Graphviz required.
Optional PyMuPDF merges the four readable Chen sheets into one PDF.
"""
from pathlib import Path
import re, subprocess, shutil
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'docs/diagrams'; OUT.mkdir(parents=True,exist_ok=True)
# These definitions mirror the SQL schema. Conceptual attributes omit SQL FKs:
# Chen diamonds already express those references. The relational diagram includes them.
entities={
'blood_group': [('blood_group_id','PK','int'),('group_name','UQ','varchar(3)')],
'donor':[('donor_id','PK','int'),('name','','varchar(100)'),('dob','','date'),('gender','','varchar(30)'),('weight_kg','','decimal(6,2)'),('phone','','varchar(30)'),('email','UQ*','varchar(160)'),('address','','text'),('blood_group_id','FK','int')],
'staff':[('staff_id','PK','int'),('name','','varchar(100)'),('phone','','varchar(30)'),('email','UQ*','varchar(160)'),('username','UQ','varchar(50)'),('password_hash','','text'),('role','','varchar(10)'),('status','','varchar(10)')],
'donation':[('donation_id','PK','int'),('donor_id','FK','int'),('collected_at','','datetime(3)'),('donation_type','','varchar(20)'),('quantity_ml','','decimal(7,2)'),('collected_by','FK','int'),('collection_status','','varchar(15)'),('screening_status','','varchar(12)'),('screening_ref','UQ','varchar(36)')],
'blood_unit':[('unit_id','PK','int'),('donation_id','FK UQ','int'),('blood_group_id','FK','int'),('storage_id','FK','int'),('volume_ml','','decimal(7,2)'),('expires_at','','datetime(3)'),('status','','varchar(15)'),('created_at','','datetime(3)')],
'storage':[('storage_id','PK','int'),('location_name','UQ','varchar(100)'),('storage_type','','varchar(50)'),('temperature_c','','decimal(5,2)'),('capacity_units','','int'),('occupied_units','','int'),('status','','varchar(12)')],
'blood_test':[('test_id','PK','int'),('unit_id','FK','int'),('tested_by','FK','int'),('test_type','','varchar(60)'),('result','','varchar(8)'),('tested_at','','datetime(3)')],
'hospital':[('hospital_id','PK','int'),('hospital_name','UQ','varchar(120)'),('phone','','varchar(30)'),('email','','varchar(160)'),('location','','text'),('status','','varchar(10)')],
'blood_request':[('request_id','PK','int'),('hospital_id','FK','int'),('blood_group_id','FK','int'),('requested_units','','int'),('priority','','varchar(10)'),('request_type','','varchar(20)'),('requested_at','','datetime(3)'),('required_at','','datetime(3)'),('status','','varchar(24)'),('verified_by','FK ?','int'),('verified_at','','datetime(3)')],
'blood_issue':[('issue_id','PK','int'),('request_id','FK','int'),('processed_by','FK','int'),('issued_at','','datetime(3)'),('issue_type','','varchar(20)'),('operation_key','UQ','varchar(36)')],
'issue_detail':[('issue_detail_id','PK','int'),('issue_id','FK','int'),('unit_id','FK UQ','int'),('volume_issued_ml','','decimal(7,2)'),('issue_status','','varchar(10)')],
}
# Read physical MySQL types from the DDL so diagrams cannot retain old dialect types.
schema = (ROOT/'database/01_schema.sql').read_text()
for table, attrs in entities.items():
    body = re.search(r'CREATE TABLE IF NOT EXISTS '+table+r' \(\n(.*?)\n\) ENGINE', schema, re.S).group(1)
    types = dict(re.findall(r'^\s+(\w+)\s+((?:enum|varchar|char|decimal|datetime)\([^\n]+?\)|bigint|int|date|text)', body, re.M))
    entities[table] = [(name,key,types.get(name,typ)) for name,key,typ in attrs]

# (left, verb, right, left participation, right participation)
rels=[('blood_group','classifies','donor','0,N','1,1'),('donor','makes','donation','0,N','1,1'),
('staff','collects','donation','0,N','1,1'),('donation','generates','blood_unit','0,1','1,1'),
('blood_group','defines','blood_unit','0,N','1,1'),('storage','stores','blood_unit','0,N','1,1'),
('blood_unit','undergoes','blood_test','0,N','1,1'),('staff','performs','blood_test','0,N','1,1'),
('hospital','submits','blood_request','0,N','1,1'),('blood_group','requested for','blood_request','0,N','1,1'),
('staff','verifies','blood_request','0,N','0,1'),('blood_request','fulfilled through','blood_issue','0,N','1,1'),
('staff','processes','blood_issue','0,N','1,1'),('blood_issue','contains','issue_detail','1,N','1,1'),
('blood_unit','issued as','issue_detail','0,1','1,1')]

def render(name,source):
    (OUT/(name+'.dot')).write_text(source)
    for fmt in ('svg','pdf','png'):
        subprocess.run(['dot',f'-T{fmt}',str(OUT/(name+'.dot')),'-o',str(OUT/(name+'.'+fmt))],check=True)

def chen(name,title,chosen,relation_indexes,attributes=False,refs=()):
    s=['digraph er {', 'graph [bgcolor="white",fontname="Arial",fontsize=22,pad="0.5",nodesep="0.38",ranksep="0.8",splines=polyline,overlap=false, dpi=100,rankdir=LR,labelloc=t,labeljust=l,',
       f'label="BLOOD BANK MANAGEMENT SYSTEM\\n{title}\\n\\nChen notation: rectangle = entity | diamond = relationship | ellipse = attribute | underline = primary key\\n(min,max) gives participation; double line = mandatory. Gray entities are references to another sheet."];',
       'node [fontname="Arial",fontsize=14,color="#486078",penwidth=1.3]; edge [fontname="Arial",fontsize=12,color="#75899d",penwidth=1.1,dir=none];']
    for e in list(chosen)+list(refs):
        s.append(f'{e} [shape=box,style="filled",fillcolor="{("#f0f1f2" if e in refs else "#e5f2fc")}",label="{e.upper()}",margin="0.18,0.12"];')
        if attributes and e in chosen:
            for i,(attr,key,typ) in enumerate(entities[e]):
                if 'FK' in key: continue
                label=f'<<U>{attr}</U>>' if key=='PK' else f'"{attr}"'
                s.append(f'{e}_a{i} [shape=ellipse,style=filled,fillcolor="#ffffff",label={label},fontsize=12,margin="0.09,0.05"]; {e} -> {e}_a{i} [color="#c1cbd5",weight=1];')
    for n in relation_indexes:
        a,verb,b,ca,cb=rels[n]; rid=f'r{n}'
        s.append(f'{rid} [shape=diamond,label="{verb.replace(" ",chr(92)+"n")}",fillcolor="#fff5df",style=filled,fontsize=12,margin="0.08,0.06"];')
        for source,target,card in ((a,rid,ca),(rid,b,cb)):
            color='"#75899d:#75899d"' if card.startswith('1') else '"#75899d"'
            s.append(f'{source} -> {target} [label="({card})",color={color},weight=3];')
    s.append('}')
    render(name,'\n'.join(s))

chen('Chen_01_Overview','01 / Complete relationship map (attributes on sheets 02–04)',list(entities),range(len(rels)))
chen('Chen_02_Donors_and_Collection','02 / Donors, collection and staff attributes', ['blood_group','donor','donation','staff'],[0,1,2],True)
chen('Chen_03_Units_Storage_and_Tests','03 / Units, storage and testing attributes', ['blood_unit','storage','blood_test'],[3,4,5,6,7],True,['donation','blood_group','staff'])
chen('Chen_04_Requests_and_Issues','04 / Hospitals, requests and issuance attributes',['hospital','blood_request','blood_issue','issue_detail'],[8,9,10,11,12,13,14],True,['staff','blood_group','blood_unit'])
chen('Chen_Full_Poster','Complete Chen model / all domain entities, attributes and relationships',list(entities),range(len(rels)),True)

# SQL attribute boxes; arrows are precise FK -> referenced PK, not Chen edges.
s=['digraph schema {','graph [bgcolor="white",fontname="Arial",fontsize=24,pad="0.55",nodesep="0.6",ranksep="1.2",rankdir=LR,splines=polyline,labelloc=t,labeljust=l,',
'label="BLOOD BANK MANAGEMENT SYSTEM\\nMySQL 8.4 / relational schema / all 11 domain tables\\n\\nArrow: foreign key → referenced primary key | PK primary key | FK foreign key | UQ unique | ? nullable FK\\nUQ* = case-insensitive unique via MySQL collation; nullable donor emails are allowed. Technical security/audit tables are documented separately."];',
'node [shape=plain,fontname="Arial"]; edge [color="#71869c",arrowsize=0.7,penwidth=1.2];']
for e,attrs in entities.items():
    label=f'<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="9" COLOR="#c4d0db"><TR><TD COLSPAN="3" BGCOLOR="#e5f2fc"><FONT POINT-SIZE="17"><B>{e.upper()}</B></FONT></TD></TR>'
    for attr,key,typ in attrs:
        typ = "enum" if typ.startswith("enum(") else typ
        label+=f'<TR><TD ALIGN="LEFT" PORT="{attr}_in" BGCOLOR="#f9fafb"><FONT POINT-SIZE="12">{key or " "}</FONT></TD><TD ALIGN="LEFT"><FONT POINT-SIZE="13">{("<U>"+attr+"</U>") if key=="PK" else attr}</FONT></TD><TD ALIGN="LEFT" PORT="{attr}"><FONT POINT-SIZE="11" COLOR="#596a78">{typ}</FONT></TD></TR>'
    label+='</TABLE>>'
    s.append(f'{e} [label={label}];')
fks=[('donor','blood_group_id','blood_group','blood_group_id'),('donation','donor_id','donor','donor_id'),('donation','collected_by','staff','staff_id'),('blood_unit','donation_id','donation','donation_id'),('blood_unit','blood_group_id','blood_group','blood_group_id'),('blood_unit','storage_id','storage','storage_id'),('blood_test','unit_id','blood_unit','unit_id'),('blood_test','tested_by','staff','staff_id'),('blood_request','hospital_id','hospital','hospital_id'),('blood_request','blood_group_id','blood_group','blood_group_id'),('blood_request','verified_by','staff','staff_id'),('blood_issue','request_id','blood_request','request_id'),('blood_issue','processed_by','staff','staff_id'),('issue_detail','issue_id','blood_issue','issue_id'),('issue_detail','unit_id','blood_unit','unit_id')]
for a,k,b,pk in fks: s.append(f'{a}:{k}:e -> {b}:{pk}_in:w;')
s.append('}');render('Relational_Schema','\n'.join(s))

try:
    import fitz
    merged=fitz.open()
    for name in ['Chen_01_Overview','Chen_02_Donors_and_Collection','Chen_03_Units_Storage_and_Tests','Chen_04_Requests_and_Issues']:
        with fitz.open(OUT/(name+'.pdf')) as p: merged.insert_pdf(p)
    merged.save(OUT/'Chen_ER_Diagram.pdf');merged.close()
except ImportError:
    print('Install PyMuPDF to combine the four Chen PDFs; individual PDFs have been generated.')
for filename in ['Chen_ER_Diagram.pdf','Relational_Schema.pdf','Relational_Schema.svg','Chen_Full_Poster.svg']:
    if (OUT/filename).exists(): shutil.copy2(OUT/filename,ROOT/'public/diagrams'/filename)
print('Generated diagrams in',OUT)
