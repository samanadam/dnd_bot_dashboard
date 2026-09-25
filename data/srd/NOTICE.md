# SRD monster and item data

`srd-2014.json` and `items-2014.json` include material taken from the System Reference Document 5.1
("SRD 5.1") by Wizards of the Coast LLC, available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
licensed under the Creative Commons Attribution 4.0 International License,
available at https://creativecommons.org/licenses/by/4.0/legalcode.

`srd-2024.json` and `items-2024.json` include material taken from the System Reference Document 5.2
("SRD 5.2") by Wizards of the Coast LLC, available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.2 is
licensed under the Creative Commons Attribution 4.0 International License,
available at https://creativecommons.org/licenses/by/4.0/legalcode.

The data was retrieved through the Open5e API (https://open5e.com), converted
to this project's stat block format and, where the source data contained an
obvious error, corrected to the published values (see `CORRECTIONS` in
`scripts/import-srd.mts`).

The equipment and magic items in `items-2014.json` and `items-2024.json` come
from the same two documents (SRD 5.1 and SRD 5.2) under the same license. They
were retrieved through the Open5e API and converted by
`scripts/import-srd-items.mts`, which keeps only entries whose own document is
one of those two and drops every other book.

Monsters and items from other books are not part of this repository. The DM adds them
privately through the portal; they are stored only on the server.
