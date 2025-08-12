import re
import cv2
from pdf2image import convert_from_path
import easyocr
from paddleocr import PaddleOCR

# Init OCR engines
easy_reader = easyocr.Reader(['en'], gpu=False)
paddle_reader = PaddleOCR(use_angle_cls=False, lang='en')

def preprocess_image_for_column(image):
    """Upscale and crop the pallet ID column."""
    h, w, _ = image.shape
    img_up = cv2.resize(image, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
    h2, w2, _ = img_up.shape
    pallet_id_col = img_up[int(h2*0.35):int(h2*0.85), int(w2*0.05):int(w2*0.22)]
    return pallet_id_col

def extract_ids_with_easyocr(image_path):
    results = easy_reader.readtext(image_path, detail=0, paragraph=False)
    ids = []
    for text in results:
        ids.extend(re.findall(r'\d{14,18}', text))
    return ids

def extract_ids_with_paddleocr(image_path):
    results = paddle_reader.ocr(image_path, cls=False)
    ids = []
    for line in results[0]:
        text = line[1][0]
        ids.extend(re.findall(r'\d{14,18}', text))
    return ids

def process_pdf(pdf_path):
    """Convert PDF to images and run OCR."""
    pages = convert_from_path(pdf_path, dpi=300)
    all_ids = []
    for i, page in enumerate(pages):
        img_path = f"page_{i+1}.png"
        page.save(img_path, "PNG")
        img = cv2.imread(img_path)
        col_img = preprocess_image_for_column(img)

        # Save column crop temporarily
        temp_path = f"col_{i+1}.png"
        cv2.imwrite(temp_path, col_img)

        # Try EasyOCR
        ids = extract_ids_with_easyocr(temp_path)
        if not ids:
            ids = extract_ids_with_paddleocr(temp_path)

        for id_val in ids:
            all_ids.append({
                "pallet_id": id_val,
                "document_name": pdf_path.split("/")[-1],
                "page_number": i + 1
            })

    return all_ids
