<?php

namespace App\Services\Cube;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\ExpenseCategory;
use App\Models\Formulation;
use App\Models\Product;
use App\Models\ProductSupplier;
use App\Models\Setting;
use App\Models\StorageLocation;
use App\Models\Supplier;
use App\Models\User;
use App\Models\UserDemand;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Throwable;

class CubeTaskExecutorService
{
    /**
     * Mandatory fields required from the user before Cube will ever create a new product.
     * Cube will NEVER assume or default any of these values from itself.
     *
     * @var array<string, array{en: string, ur: string, hint_en: string, hint_ur: string}>
     */
    protected const REQUIRED_CREATE_PRODUCT_FIELDS = [
        'name' => [
            'en' => 'Product Name',
            'ur' => 'پروڈکٹ کا نام (Product Name)',
            'hint_en' => 'Full product name & strength, e.g., `Panadol 500mg Tablet`',
            'hint_ur' => 'پروڈکٹ کا مکمل نام، مثلاً `Panadol 500mg Tablet`',
        ],
        'pack_size' => [
            'en' => 'Pack Size',
            'ur' => 'پیک سائز (Pack Size)',
            'hint_en' => 'How many units are in 1 pack (integer ≥ 1, e.g., `100`, `30`, `10`, `1`)',
            'hint_ur' => 'ایک پیک میں کتنے یونٹس ہیں (مثلاً `100`، `30`، `10`)',
        ],
        'category' => [
            'en' => 'Category',
            'ur' => 'کیٹیگری (Category)',
            'hint_en' => 'Product category, e.g., `Tablets`, `Capsules`, `Syrups`',
            'hint_ur' => 'پروڈکٹ کی کیٹیگری، مثلاً `Tablets`, `Capsules`, `Syrups`',
        ],
        'brand' => [
            'en' => 'Brand / Manufacturer (Existing Only)',
            'ur' => 'برانڈ / کمپنی (صرف پہلے سے موجود)',
            'hint_en' => 'Must match an existing Brand in your catalog (Cube never creates new brands)',
            'hint_ur' => 'آپ کے کیٹلاگ میں پہلے سے موجود برانڈ کا نام (کیوب نیا برانڈ خود نہیں بناتا)',
        ],
        'supplier' => [
            'en' => 'Supplier / Distributor (Existing Only)',
            'ur' => 'سپلائر / ڈسٹری بیوٹر (صرف پہلے سے موجود)',
            'hint_en' => 'Must match an existing Supplier in your catalog (Cube never creates new suppliers)',
            'hint_ur' => 'آپ کے کیٹلاگ میں پہلے سے موجود سپلائر کا نام (کیوب نیا سپلائر خود نہیں بناتا)',
        ],
    ];
    /**
     * Built-in pharmaceutical generic/salt dictionary for fast, accurate background
     * formulation enrichment even before or alongside external AI calls.
     *
     * @var array<string, string>
     */
    /**
     * 100%-Verified pharmaceutical generic/salt dictionary (DRAP Pakistan & International Originator Brands).
     * Matched strictly against the normalized exact Brand + Variant Core (`extractBrandCore`) so base brands
     * are NEVER confused with combination variants (e.g. `betnovate` vs `betnovate n`, `lipiget` vs `lipiget ez`).
     *
     * @var array<string, string>
     */
    protected const PHARMACY_SALT_DICTIONARY = [
        // Analgesics, Antipyretics, NSAIDs & Muscle Relaxants
        'panadol cf' => 'Paracetamol + Chlorpheniramine + Pseudoephedrine',
        'panadol extra' => 'Paracetamol + Caffeine',
        'panadol night' => 'Paracetamol + Diphenhydramine',
        'panadol extend' => 'Paracetamol',
        'panadol' => 'Paracetamol',
        'calpol' => 'Paracetamol',
        'calpol 6 plus' => 'Paracetamol',
        'febrol' => 'Paracetamol',
        'disprol' => 'Paracetamol',
        'provas' => 'Paracetamol',
        'tylenol' => 'Paracetamol',
        'parasup' => 'Paracetamol',
        'paracetamol' => 'Paracetamol',
        'acetaminophen' => 'Paracetamol',
        'nuberol forte' => 'Paracetamol + Orphenadrine Citrate',
        'nuberol' => 'Paracetamol + Orphenadrine Citrate',
        'tonoflex p' => 'Tramadol + Paracetamol',
        'tonoflex' => 'Tramadol',
        'tramal' => 'Tramadol',
        'brufen' => 'Ibuprofen',
        'advil' => 'Ibuprofen',
        'ibuprofen' => 'Ibuprofen',
        'arinac forte' => 'Ibuprofen + Pseudoephedrine',
        'arinac' => 'Ibuprofen + Pseudoephedrine',
        'ponstan forte' => 'Mefenamic Acid',
        'ponstan' => 'Mefenamic Acid',
        'mefenamic acid' => 'Mefenamic Acid',
        'disprin' => 'Aspirin',
        'loprin' => 'Aspirin',
        'ascard' => 'Aspirin',
        'aspirin' => 'Aspirin',
        'voltral' => 'Diclofenac Sodium',
        'dicloran' => 'Diclofenac Sodium',
        'diclowan' => 'Diclofenac Sodium',
        'diclofenac sodium' => 'Diclofenac Sodium',
        'diclofenac' => 'Diclofenac Sodium',
        'caflam' => 'Diclofenac Potassium',
        'diclofenac potassium' => 'Diclofenac Potassium',
        'synflex' => 'Naproxen Sodium',
        'naproxen' => 'Naproxen Sodium',
        'brexin' => 'Piroxicam',
        'feldene' => 'Piroxicam',
        'piroxicam' => 'Piroxicam',
        'mobic' => 'Meloxicam',
        'meloxicam' => 'Meloxicam',
        'celebrex' => 'Celecoxib',
        'celecoxib' => 'Celecoxib',
        'arcoxia' => 'Etoricoxib',
        'etoricoxib' => 'Etoricoxib',
        'ansaid' => 'Flurbiprofen',
        'froben' => 'Flurbiprofen',
        'flurbiprofen' => 'Flurbiprofen',
        'movax' => 'Tizanidine',
        'sirdalud' => 'Tizanidine',
        'tizanidine' => 'Tizanidine',

        // Penicillins & Beta-Lactam Antibiotics
        'augmentin' => 'Amoxicillin + Clavulanic Acid',
        'calamox' => 'Amoxicillin + Clavulanic Acid',
        'amoxi clav' => 'Amoxicillin + Clavulanic Acid',
        'co amoxiclav' => 'Amoxicillin + Clavulanic Acid',
        'amoxil' => 'Amoxicillin',
        'amoxicillin' => 'Amoxicillin',
        'ospamox' => 'Amoxicillin',
        'amocillin' => 'Amoxicillin',
        'amoxicap' => 'Amoxicillin',
        'amoxipen' => 'Amoxicillin',
        'amplipen' => 'Ampicillin',
        'omnipen' => 'Ampicillin',
        'ampicillin' => 'Ampicillin',
        'ampicap' => 'Ampicillin',
        'ampicil' => 'Ampicillin',
        'ampimaz' => 'Ampicillin',
        'ampiwil' => 'Ampicillin',
        'ampiclox' => 'Ampicillin + Cloxacillin',
        'apoclox' => 'Cloxacillin',
        'cloxacillin' => 'Cloxacillin',
        'penidure' => 'Benzathine Penicillin G',
        'tanzo' => 'Piperacillin + Tazobactam',
        'tazocin' => 'Piperacillin + Tazobactam',

        // Cephalosporins
        'cefspan' => 'Cefixime',
        'caricef' => 'Cefixime',
        'cefiget' => 'Cefixime',
        'cefim' => 'Cefixime',
        'suprax' => 'Cefixime',
        'glixim' => 'Cefixime',
        'cefix' => 'Cefixime',
        'cefixime' => 'Cefixime',
        'velosef' => 'Cephradine',
        'cephradine' => 'Cephradine',
        'keflex' => 'Cephalexin',
        'maclexin' => 'Cephalexin',
        'cephalexin' => 'Cephalexin',
        'rocephin' => 'Ceftriaxone',
        'ceftron' => 'Ceftriaxone',
        'traxon' => 'Ceftriaxone',
        'incep' => 'Ceftriaxone',
        'oxidil' => 'Ceftriaxone',
        'ceftriaxone' => 'Ceftriaxone',
        'ceftrixone' => 'Ceftriaxone',
        'claforan' => 'Cefotaxime',
        'cefotaxime' => 'Cefotaxime',
        'zinacef' => 'Cefuroxime',
        'zinnat' => 'Cefuroxime',
        'cefuroxime' => 'Cefuroxime',
        'ceclor' => 'Cefaclor',
        'cetaclor' => 'Cefaclor',
        'cefaclor' => 'Cefaclor',
        'duricef' => 'Cefadroxil',
        'cefadroxil' => 'Cefadroxil',
        'fortum' => 'Ceftazidime',
        'ceftazidime' => 'Ceftazidime',
        'maxipime' => 'Cefepime',
        'cefepime' => 'Cefepime',
        'sulzone' => 'Cefoperazone + Sulbactam',

        // Macrolides, Fluoroquinolones, Aminoglycosides & Other Antibiotics
        'azomax' => 'Azithromycin',
        'zithromax' => 'Azithromycin',
        'zetro' => 'Azithromycin',
        'azirolide' => 'Azithromycin',
        'aziromycin' => 'Azithromycin',
        'azogil' => 'Azithromycin',
        'zimax' => 'Azithromycin',
        'azithromycin' => 'Azithromycin',
        'klaricid' => 'Clarithromycin',
        'clatz' => 'Clarithromycin',
        'clarithromycin' => 'Clarithromycin',
        'erythrocin' => 'Erythromycin',
        'erythromycin' => 'Erythromycin',
        'rulid' => 'Roxithromycin',
        'roxithromycin' => 'Roxithromycin',
        'novidat' => 'Ciprofloxacin',
        'ciproxin' => 'Ciprofloxacin',
        'dicip' => 'Ciprofloxacin',
        'ciprofloxacin' => 'Ciprofloxacin',
        'leflox' => 'Levofloxacin',
        'cravit' => 'Levofloxacin',
        'levoson' => 'Levofloxacin',
        'lexiwan' => 'Levofloxacin',
        'levofloxacin' => 'Levofloxacin',
        'avelox' => 'Moxifloxacin',
        'moxiget' => 'Moxifloxacin',
        'moxifloxacin' => 'Moxifloxacin',
        'tarivid' => 'Ofloxacin',
        'getiflox' => 'Ofloxacin',
        'ofloxacin' => 'Ofloxacin',
        'amikin' => 'Amikacin',
        'amikoside' => 'Amikacin',
        'amkay' => 'Amikacin',
        'amkeen' => 'Amikacin',
        'amikacin' => 'Amikacin',
        'garamycin' => 'Gentamicin',
        'genticyn' => 'Gentamicin',
        'gentamicin' => 'Gentamicin',
        'vibramycin' => 'Doxycycline',
        'doxycycline' => 'Doxycycline',
        'flagyl' => 'Metronidazole',
        'metronidazole' => 'Metronidazole',
        'entamizole' => 'Diloxanide Furoate + Metronidazole',
        'dalacin c' => 'Clindamycin',
        'dalacin' => 'Clindamycin',
        'clindamycin' => 'Clindamycin',
        'lincocin' => 'Lincomycin',
        'lincomycin' => 'Lincomycin',
        'zyvox' => 'Linezolid',
        'linezolid' => 'Linezolid',
        'meronem' => 'Meropenem',
        'meropenem' => 'Meropenem',
        'septrin' => 'Trimethoprim + Sulfamethoxazole',
        'bactrim' => 'Trimethoprim + Sulfamethoxazole',
        'fosfomycin' => 'Fosfomycin',
        'monurol' => 'Fosfomycin',
        'rifagut' => 'Rifaximin',
        'rifaximin' => 'Rifaximin',
        'chlormic' => 'Chloramphenicol',
        'chloramphenicol' => 'Chloramphenicol',

        // Anti-TB, Antifungals, Antivirals & Antiparasitics
        'myambutol inh' => 'Ethambutol + Isoniazid',
        'myambutol inh forte' => 'Ethambutol + Isoniazid',
        'myambutol' => 'Ethambutol',
        'myrin p' => 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol',
        'myrin p forte' => 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol',
        'myrin' => 'Rifampicin + Isoniazid + Ethambutol',
        'diflucan' => 'Fluconazole',
        'flu z' => 'Fluconazole',
        'fluconazole' => 'Fluconazole',
        'sporanox' => 'Itraconazole',
        'itranex' => 'Itraconazole',
        'itraconazole' => 'Itraconazole',
        'nizoral' => 'Ketoconazole',
        'ketoconazole' => 'Ketoconazole',
        'nilstat' => 'Nystatin',
        'nystatin' => 'Nystatin',
        'canesten' => 'Clotrimazole',
        'clotrimazole' => 'Clotrimazole',
        'daktarin' => 'Miconazole',
        'miconazole' => 'Miconazole',
        'lamisil' => 'Terbinafine',
        'terbinafine' => 'Terbinafine',
        'zovirax' => 'Acyclovir',
        'acyclovir' => 'Acyclovir',
        'medivirin' => 'Ribavirin',
        'ribavirin' => 'Ribavirin',
        'zentel' => 'Albendazole',
        'albendazole' => 'Albendazole',
        'vermox' => 'Mebendazole',
        'mebendazole' => 'Mebendazole',
        'combantrin' => 'Pyrantel Pamoate',
        'hcq' => 'Hydroxychloroquine',
        'plaquenil' => 'Hydroxychloroquine',
        'hydroxychloroquine' => 'Hydroxychloroquine',
        'resochin' => 'Chloroquine',
        'chloroquine' => 'Chloroquine',
        'quinine' => 'Quinine',

        // Gastroenterology (PPIs, Antacids, Antiemetics, Laxatives, Antispasmodics)
        'risek' => 'Omeprazole',
        'losec' => 'Omeprazole',
        'omsta' => 'Omeprazole',
        'omeprazole' => 'Omeprazole',
        'nexum' => 'Esomeprazole',
        'nexium' => 'Esomeprazole',
        'esso' => 'Esomeprazole',
        'eger' => 'Esomeprazole',
        'esomeprazole' => 'Esomeprazole',
        'pantocid' => 'Pantoprazole',
        'protonix' => 'Pantoprazole',
        'zopent' => 'Pantoprazole',
        'pantoprazole' => 'Pantoprazole',
        'pariet' => 'Rabeprazole',
        'barq' => 'Rabeprazole',
        'rabz' => 'Rabeprazole',
        'rabeprazole' => 'Rabeprazole',
        'lansoprazole' => 'Lansoprazole',
        'dexilant' => 'Dexlansoprazole',
        'dexlansoprazole' => 'Dexlansoprazole',
        'pepcid' => 'Famotidine',
        'famowan' => 'Famotidine',
        'famotidine' => 'Famotidine',
        'gaviscon' => 'Sodium Alginate + Potassium Bicarbonate',
        'mucaine' => 'Oxethazaine + Aluminum Hydroxide + Magnesium Hydroxide',
        'gravinate' => 'Dimenhydrinate',
        'dimenhydrinate' => 'Dimenhydrinate',
        'motilium' => 'Domperidone',
        'peridone' => 'Domperidone',
        'domperidone' => 'Domperidone',
        'maxolon' => 'Metoclopramide',
        'metoclopramide' => 'Metoclopramide',
        'onavert' => 'Ondansetron',
        'zofran' => 'Ondansetron',
        'ondansetron' => 'Ondansetron',
        'ganaton' => 'Itopride',
        'itopride' => 'Itopride',
        'levosulpiride' => 'Levosulpiride',
        'levosulperide' => 'Levosulpiride',
        'revoren levosulperide' => 'Levosulpiride',
        'buscopan plus' => 'Hyoscine Butylbromide + Paracetamol',
        'buscopan' => 'Hyoscine Butylbromide',
        'hyoscine butylbromide' => 'Hyoscine Butylbromide',
        'no spa forte' => 'Drotaverine',
        'no spa' => 'Drotaverine',
        'nospa' => 'Drotaverine',
        'drotaverine' => 'Drotaverine',
        'colofac' => 'Mebeverine',
        'mebeverine' => 'Mebeverine',
        'duphalac' => 'Lactulose',
        'lilac' => 'Lactulose',
        'prulax' => 'Lactulose',
        'lactulose' => 'Lactulose',
        'skilax' => 'Sodium Picosulfate',
        'imodium' => 'Loperamide',
        'loperamide' => 'Loperamide',
        'ors' => 'Oral Rehydration Salts',
        'pedialyte' => 'Oral Rehydration Salts',
        'geofman salt' => 'Oral Rehydration Salts',

        // Allergy, Respiratory & Cough
        'rigix' => 'Cetirizine',
        'zyrtec' => 'Cetirizine',
        'cetirizine' => 'Cetirizine',
        'xyzal' => 'Levocetirizine',
        'levocetirizine' => 'Levocetirizine',
        'softin' => 'Loratadine',
        'claritin' => 'Loratadine',
        'loratadine' => 'Loratadine',
        'aerius' => 'Desloratadine',
        'desloratadine' => 'Desloratadine',
        'telfast' => 'Fexofenadine',
        'fexet' => 'Fexofenadine',
        'fexofenadine' => 'Fexofenadine',
        'kestine' => 'Ebastine',
        'ebastine' => 'Ebastine',
        'avil' => 'Pheniramine Maleate',
        'piriton' => 'Chlorpheniramine Maleate',
        'ventolin' => 'Salbutamol',
        'salbutamol' => 'Salbutamol',
        'atrovent' => 'Ipratropium Bromide',
        'myteka' => 'Montelukast',
        'singulair' => 'Montelukast',
        'montelukast' => 'Montelukast',
        'hydryllin' => 'Aminophylline + Diphenhydramine + Ammonium Chloride',
        'acefyl' => 'Acefylline Piperazine + Diphenhydramine',
        'pulmonol' => 'Chlorpheniramine + Dextromethorphan + Pseudoephedrine',
        'ammonium chloride' => 'Ammonium Chloride',
        'amoniumchloride' => 'Ammonium Chloride',
        'xynosin' => 'Xylometazoline',
        'otrivin' => 'Xylometazoline',
        'xylometazoline' => 'Xylometazoline',

        // Diabetes & Endocrinology
        'glucophage' => 'Metformin',
        'metformin' => 'Metformin',
        'amaryl m' => 'Glimepiride + Metformin',
        'amaryl' => 'Glimepiride',
        'getryl m' => 'Glimepiride + Metformin',
        'getryl' => 'Glimepiride',
        'getformin' => 'Glimepiride + Metformin',
        'neoglip' => 'Glimepiride + Metformin',
        'glimepiride' => 'Glimepiride',
        'diamicron' => 'Gliclazide',
        'gliclazide' => 'Gliclazide',
        'daonil' => 'Glibenclamide',
        'glibenclamide' => 'Glibenclamide',
        'janumet' => 'Sitagliptin + Metformin',
        'januvia' => 'Sitagliptin',
        'sita gen' => 'Sitagliptin',
        'sitagliptin' => 'Sitagliptin',
        'galvus met' => 'Vildagliptin + Metformin',
        'galvus' => 'Vildagliptin',
        'vildagliptin' => 'Vildagliptin',
        'trajenta' => 'Linagliptin',
        'linagliptin' => 'Linagliptin',
        'jardiance' => 'Empagliflozin',
        'empagliflozin' => 'Empagliflozin',
        'empaphage l' => 'Empagliflozin + Linagliptin',
        'forxiga' => 'Dapagliflozin',
        'dapagliflozin' => 'Dapagliflozin',
        'thyroxine' => 'Levothyroxine Sodium',
        'levothyroxine' => 'Levothyroxine Sodium',
        'neomercazole' => 'Carbimazole',
        'mercazole' => 'Carbimazole',
        'carbimazole' => 'Carbimazole',

        // Cardiovascular, Antihypertensives, Statins & Antiplatelets
        'norvasc' => 'Amlodipine',
        'sofvasc' => 'Amlodipine',
        'amdipine' => 'Amlodipine',
        'amlocard' => 'Amlodipine',
        'amlod' => 'Amlodipine',
        'amlopin' => 'Amlodipine',
        'amlowan' => 'Amlodipine',
        'amodip' => 'Amlodipine',
        'amlodipine' => 'Amlodipine',
        'amodip v' => 'Amlodipine + Valsartan',
        'amstan' => 'Amlodipine + Valsartan',
        'exforge hct' => 'Amlodipine + Valsartan + Hydrochlorothiazide',
        'exforge' => 'Amlodipine + Valsartan',
        'velker plus' => 'Amlodipine + Valsartan',
        'diovan' => 'Valsartan',
        'valsartan' => 'Valsartan',
        'co diovan' => 'Valsartan + Hydrochlorothiazide',
        'cozaar' => 'Losartan Potassium',
        'eziday' => 'Losartan Potassium',
        'losartan' => 'Losartan Potassium',
        'eziday plus' => 'Losartan Potassium + Hydrochlorothiazide',
        'co eziday' => 'Losartan Potassium + Hydrochlorothiazide',
        'hyzaar' => 'Losartan Potassium + Hydrochlorothiazide',
        'micardis' => 'Telmisartan',
        'telmisartan' => 'Telmisartan',
        'canditensin' => 'Candesartan',
        'atacand' => 'Candesartan',
        'candesartan' => 'Candesartan',
        'capoten' => 'Captopril',
        'captopril' => 'Captopril',
        'zestril' => 'Lisinopril',
        'lisinopril' => 'Lisinopril',
        'ramipril' => 'Ramipril',
        'tritace' => 'Ramipril',
        'concor plus' => 'Bisoprolol + Hydrochlorothiazide',
        'concor' => 'Bisoprolol',
        'bisoprolol' => 'Bisoprolol',
        'tenormin' => 'Atenolol',
        'atenolol' => 'Atenolol',
        'inderal' => 'Propranolol',
        'propranolol' => 'Propranolol',
        'carvilol' => 'Carvedilol',
        'carvedilol' => 'Carvedilol',
        'herbesser' => 'Diltiazem',
        'metazem' => 'Diltiazem',
        'diltiazem' => 'Diltiazem',
        'calan' => 'Verapamil',
        'isoptin' => 'Verapamil',
        'verapamil' => 'Verapamil',
        'lipiget ez' => 'Atorvastatin + Ezetimibe',
        'lipiget' => 'Atorvastatin',
        'lipitor' => 'Atorvastatin',
        'atorva' => 'Atorvastatin',
        'atorvastatin' => 'Atorvastatin',
        'rovista' => 'Rosuvastatin',
        'crestor' => 'Rosuvastatin',
        'cholestor' => 'Rosuvastatin',
        'x plended' => 'Rosuvastatin',
        'rosuvastatin' => 'Rosuvastatin',
        'plavix' => 'Clopidogrel',
        'lowplat' => 'Clopidogrel',
        'norplat' => 'Clopidogrel',
        'clopidogrel' => 'Clopidogrel',
        'xarelto' => 'Rivaroxaban',
        'rivaroxaban' => 'Rivaroxaban',
        'lasix' => 'Furosemide',
        'furosemide' => 'Furosemide',
        'spiromide' => 'Furosemide + Spironolactone',
        'aldactone' => 'Spironolactone',
        'spironolactone' => 'Spironolactone',
        'transamin' => 'Tranexamic Acid',
        'cyklokapron' => 'Tranexamic Acid',
        'amtraxa' => 'Tranexamic Acid',
        'tranexamic acid' => 'Tranexamic Acid',

        // CNS, Neurology & Psychiatry
        'tegral' => 'Carbamazepine',
        'tegretol' => 'Carbamazepine',
        'karbaton' => 'Carbamazepine',
        'carbamazepine' => 'Carbamazepine',
        'epival' => 'Divalproex Sodium',
        'depakote' => 'Divalproex Sodium',
        'keppra' => 'Levetiracetam',
        'lerace' => 'Levetiracetam',
        'levetiracetam' => 'Levetiracetam',
        'lamictal' => 'Lamotrigine',
        'lamitor' => 'Lamotrigine',
        'lamotrigine' => 'Lamotrigine',
        'topamax' => 'Topiramate',
        'topiramate' => 'Topiramate',
        'lyrica' => 'Pregabalin',
        'gabica' => 'Pregabalin',
        'pregabalin' => 'Pregabalin',
        'neurontin' => 'Gabapentin',
        'gabix' => 'Gabapentin',
        'gabapentin' => 'Gabapentin',
        'amitryp' => 'Amitriptyline',
        'tryptanol' => 'Amitriptyline',
        'amitriptyline' => 'Amitriptyline',
        'zoloft' => 'Sertraline',
        'gloft' => 'Sertraline',
        'sertraline' => 'Sertraline',
        'cipralex' => 'Escitalopram',
        'morcet' => 'Escitalopram',
        'esglit' => 'Escitalopram',
        'escitalopram' => 'Escitalopram',
        'prozac' => 'Fluoxetine',
        'fluoxetine' => 'Fluoxetine',
        'paxil' => 'Paroxetine',
        'seroxat' => 'Paroxetine',
        'paroxetine' => 'Paroxetine',
        'xanax' => 'Alprazolam',
        'alprazolam' => 'Alprazolam',
        'lexotanil' => 'Bromazepam',
        'bromazepam' => 'Bromazepam',
        'rivotril' => 'Clonazepam',
        'clonazepam' => 'Clonazepam',
        'valium' => 'Diazepam',
        'diazepam' => 'Diazepam',
        'ativan' => 'Lorazepam',
        'lorazepam' => 'Lorazepam',
        'dormicum' => 'Midazolam',
        'midazolam' => 'Midazolam',
        'serc' => 'Betahistine',
        'betahistine' => 'Betahistine',
        'stemetil' => 'Prochlorperazine',
        'prochlorperazine' => 'Prochlorperazine',
        'sibelium' => 'Flunarizine',
        'flunarizine' => 'Flunarizine',

        // Vitamins, Minerals & Hematinics
        'surbex z' => 'Vitamin B-Complex + Vitamin C + Zinc',
        'surbex' => 'Vitamin B-Complex',
        'neurobion' => 'Vitamin B1 + Vitamin B6 + Vitamin B12',
        'methycobal' => 'Mecobalamin (Vitamin B12)',
        'mecobalamin' => 'Mecobalamin (Vitamin B12)',
        'cac 1000 plus' => 'Calcium + Vitamin C + Vitamin D3 + Vitamin B6',
        'cac 1000' => 'Calcium + Vitamin C + Vitamin D3',
        'sunny d' => 'Cholecalciferol (Vitamin D3)',
        'indrop d' => 'Cholecalciferol (Vitamin D3)',
        'glaxos d' => 'Glucose + Calcium + Vitamin D',
        'bon one' => 'Alfacalcidol',
        'maxi alfa' => 'Alfacalcidol',
        'alfacal' => 'Alfacalcidol',
        'alfacalcidol' => 'Alfacalcidol',
        'fefol' => 'Ferrous Sulfate + Folic Acid',
        'folic acid' => 'Folic Acid',
        'folic acid zafa' => 'Folic Acid',

        // Dermatology, Corticosteroids, Ophthalmic & Topical
        'polyfax plus' => 'Polymyxin B + Bacitracin Zinc + Lignocaine',
        'polyfax' => 'Polymyxin B + Bacitracin Zinc',
        'betnovate n' => 'Betamethasone Valerate + Neomycin Sulfate',
        'betnovate c' => 'Betamethasone Valerate + Clioquinol',
        'betnovate' => 'Betamethasone Valerate',
        'betamet' => 'Betamethasone Valerate',
        'fucidin h' => 'Fusidic Acid + Hydrocortisone',
        'fucidin' => 'Fusidic Acid',
        'fusidic acid' => 'Fusidic Acid',
        'bactroban' => 'Mupirocin',
        'mupirocin' => 'Mupirocin',
        'kenacomb' => 'Triamcinolone + Neomycin + Nystatin + Gramicidin',
        'lotricort' => 'Clotrimazole + Hydrocortisone',
        'locasalic' => 'Flumetasone Pivalate + Salicylic Acid',
        'selsun' => 'Selenium Sulfide',
        'oradin' => 'Chlorhexidine Gluconate',
        'potassium permanganate' => 'Potassium Permanganate',
        'potasium permanganate' => 'Potassium Permanganate',
        'deltacoortril' => 'Prednisolone',
        'deltacortril' => 'Prednisolone',
        'prednisolone' => 'Prednisolone',
        'solumedrol' => 'Methylprednisolone',
        'methylprednisolone' => 'Methylprednisolone',
        'decadron' => 'Dexamethasone',
        'dexamethasone' => 'Dexamethasone',
        'dexcip' => 'Dexamethasone + Ciprofloxacin',
        'ketro' => 'Ketorolac Tromethamine',
        'atropine' => 'Atropine',
        'nordette' => 'Levonorgestrel + Ethinylestradiol',
        'duphaston' => 'Dydrogesterone',
        'dydrogesterone' => 'Dydrogesterone',
        'primolut n' => 'Norethisterone',
        'norethisterone' => 'Norethisterone',
    ];

    public function __construct(
        protected GroqProvider $groqProvider,
        protected GeminiProvider $geminiProvider,
        protected CubeQuotaGuard $quotaGuard,
    ) {}

    /**
     * Inspects a natural-language chat message to determine if the user is asking Cube
     * to perform an operational task (Add Product, Edit Product, Bulk Add/Auto-Fill Formulations,
     * a follow-up answer to a pending task with missing required fields, or a forbidden Delete command).
     *
     * Returns `null` if the message is a normal informational Q&A question.
     *
     * @param  array<int, array{role: string, content: string}>  $history
     * @return ?array<string, mixed>
     */
    public function detectAndExecuteFromChat(?User $user, string $question, string $language = 'en', string $productVersion = '2026.10', array $history = [], bool $userConfirmed = false): ?array
    {
        $trimmed = trim($question);
        if ($trimmed === '') {
            return null;
        }

        $lower = mb_strtolower($trimmed, 'UTF-8');

        // 1. Do NOT intercept informational "how to / what is / why / explain / show me" questions
        $isInformationalQuestion = (bool) preg_match(
            '/^(how\s+(to|do|can|does|should)|what\s+(is|are|does|happens)|where\s+(is|can|do)|why\s+(is|do|does|can|cant|cannot)|when\s+(should|do)|explain\b|compare\b|difference\b|show\s+me\b|walk\s+me\b|take\s+me\b|demonstrate\b|tell\s+me\s+(how|about|what))/iu',
            $lower
        ) || (bool) preg_match(
            '/\b(how\s+to\s+(add|create|edit|update|delete|remove|make)|kaise\s+(add|create|edit|update|delete|banayein|karein)|kesay\s+(add|create|edit|delete)|tareeqa\s+kya|tarika\s+kya|کیسے\s+(بنائیں|کریں|ڈالیں|ڈیلیٹ)|طریقہ\s+کیا)\b/iu',
            $lower
        );

        if ($isInformationalQuestion) {
            return null;
        }

        // 2. HARDCODED NON-DESTRUCTIVE GUARDRAIL: Block any imperative Delete / Remove / Wipe command
        if ($this->isDestructiveDeleteCommand($lower)) {
            return $this->buildDeleteBlockedResponse($productVersion);
        }

        // 3. Check if the user has an active pending task waiting for required fields or awaiting user permission
        $pendingTask = $user ? $this->getPendingTask($user) : null;
        if (is_array($pendingTask) && ! empty($pendingTask['action'])) {
            if ($this->isCancelCommand($lower)) {
                $this->clearPendingTask($user);

                return $this->buildTaskCancelledResponse($productVersion);
            }

            $isAwaitingPermission = ! empty($pendingTask['awaiting_permission'])
                || (($pendingTask['status'] ?? '') === 'awaiting_permission');

            if ($isAwaitingPermission && ($userConfirmed || $this->isConfirmCommand($lower))) {
                $pendingAction = (string) $pendingTask['action'];
                $this->clearPendingTask($user);

                if ($pendingAction === 'create_products') {
                    return $this->executeCreateProducts($user, [
                        'products' => $pendingTask['products'] ?? [],
                        'user_confirmed' => true,
                    ], $productVersion);
                }

                if ($pendingAction === 'update_products') {
                    return $this->executeUpdateProducts($user, [
                        'updates' => $pendingTask['updates'] ?? [],
                        'user_confirmed' => true,
                    ], $productVersion);
                }

                if ($pendingAction === 'bulk_assign_formulations') {
                    return $this->executeBulkAssignFormulations($user, [
                        'assignments' => $pendingTask['assignments'] ?? [],
                        'standalone_formulations' => $pendingTask['standalone_formulations'] ?? [],
                        'user_confirmed' => true,
                    ], $productVersion);
                }

                if ($pendingAction === 'bulk_autofill_missing_formulations') {
                    return $this->executeBulkAutofillMissingFormulations($user, [
                        'batch_size' => (int) ($pendingTask['batch_size'] ?? 20),
                        'after_id' => 0,
                        'filter_query' => (string) ($pendingTask['filter_query'] ?? ''),
                        'user_confirmed' => true,
                    ], $productVersion);
                }

                if (in_array($pendingAction, [
                    'create_brands', 'update_brands',
                    'create_categories', 'update_categories',
                    'create_suppliers', 'update_suppliers',
                    'create_customers', 'update_customers',
                    'create_user_demands',
                    'create_storage_locations',
                    'create_expense_categories',
                ], true)) {
                    return $this->executeMasterEntityTask($user, $pendingAction, $pendingTask['payload'] ?? [], $productVersion, true);
                }
            }

            $explicitIntent = $this->classifyActionIntent($lower);

            if ($explicitIntent === 'bulk_autofill_missing_formulations') {
                $this->clearPendingTask($user);
                $filterQuery = $this->extractOptionalFilterFromPrompt($trimmed);

                if (! $userConfirmed) {
                    return $this->requestBulkAutofillPermission($user, $filterQuery, $productVersion);
                }

                return $this->executeBulkAutofillMissingFormulations($user, [
                    'batch_size' => 20,
                    'after_id' => 0,
                    'filter_query' => $filterQuery,
                    'user_confirmed' => true,
                ], $productVersion);
            }

            // If the user is replying with the missing fields (or continuing/adjusting the same task type), merge & continue
            if ($explicitIntent === null || $explicitIntent === $pendingTask['action']) {
                return $this->continuePendingTask($user, $pendingTask, $trimmed, $productVersion, $userConfirmed);
            }

            // User explicitly started a different task action; clear old pending task and proceed
            $this->clearPendingTask($user);
        }

        // 4. Check if the message is a Bulk Formulation command, Add Product command, or Edit Product command
        $intentType = $this->classifyActionIntent($lower);
        if ($intentType === null) {
            return null;
        }

        if (! $user) {
            return $this->buildUnauthorizedResponse($productVersion);
        }

        if ($intentType === 'bulk_autofill_missing_formulations') {
            $filterQuery = $this->extractOptionalFilterFromPrompt($trimmed);
            if (! $userConfirmed) {
                return $this->requestBulkAutofillPermission($user, $filterQuery, $productVersion);
            }

            return $this->executeBulkAutofillMissingFormulations($user, [
                'batch_size' => 20,
                'after_id' => 0,
                'filter_query' => $filterQuery,
                'user_confirmed' => true,
            ], $productVersion);
        }

        // Parse structured parameters using AI (with deterministic local parser fallback)
        $parsedTask = $this->parseTaskWithAiOrLocal($trimmed, $intentType);
        $parsedTask['user_confirmed'] = $userConfirmed;

        $action = (string) ($parsedTask['action'] ?? $intentType);
        if (str_contains($action, 'delete') || str_contains($action, 'remove') || str_contains($action, 'destroy')) {
            return $this->buildDeleteBlockedResponse($productVersion);
        }

        if ($action === 'bulk_autofill_missing_formulations') {
            $filterQuery = (string) ($parsedTask['filter_query'] ?? '');
            if (! $userConfirmed) {
                return $this->requestBulkAutofillPermission($user, $filterQuery, $productVersion);
            }

            return $this->executeBulkAutofillMissingFormulations($user, [
                'batch_size' => 20,
                'after_id' => 0,
                'filter_query' => $filterQuery,
                'user_confirmed' => true,
            ], $productVersion);
        }

        if ($action === 'bulk_assign_formulations') {
            return $this->executeBulkAssignFormulations($user, $parsedTask, $productVersion, $trimmed);
        }

        if ($action === 'create_products') {
            // Strip any unstated assumptions that AI might have guessed from world knowledge
            if (is_array($parsedTask['products'] ?? null)) {
                $parsedTask['products'] = array_map(
                    fn ($item) => is_array($item) ? $this->verifyExtractedFieldsAgainstUserText($item, $trimmed) : $item,
                    $parsedTask['products']
                );
            }

            return $this->executeCreateProducts($user, $parsedTask, $productVersion);
        }

        if ($action === 'update_products') {
            return $this->executeUpdateProducts($user, $parsedTask, $productVersion);
        }

        if (in_array($action, [
            'create_brands', 'update_brands',
            'create_categories', 'update_categories',
            'create_suppliers', 'update_suppliers',
            'create_customers', 'update_customers',
            'create_user_demands',
            'create_storage_locations',
            'create_expense_categories',
        ], true)) {
            return $this->executeMasterEntityTask($user, $action, $parsedTask, $productVersion, $userConfirmed);
        }

        return null;
    }

    /**
     * Executes a structured task directly via `POST /api/cube/execute-task`
     * (used by background formulation batch continuation and Quick Task buttons).
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function executeStructuredTask(?User $user, array $payload, string $productVersion = '2026.10'): array
    {
        if (! $user) {
            return $this->buildUnauthorizedResponse($productVersion);
        }

        $taskType = trim((string) ($payload['task_type'] ?? ''));

        // Hardcoded non-destructive check: never allow any delete task type
        if (
            $taskType === '' ||
            str_contains(strtolower($taskType), 'delete') ||
            str_contains(strtolower($taskType), 'remove') ||
            str_contains(strtolower($taskType), 'destroy')
        ) {
            return $this->buildDeleteBlockedResponse($productVersion);
        }

        return match ($taskType) {
            'bulk_autofill_missing_formulations' => $this->executeBulkAutofillMissingFormulations($user, $payload, $productVersion),
            'bulk_assign_formulations' => $this->executeBulkAssignFormulations($user, $payload, $productVersion),
            'create_products' => $this->executeCreateProducts($user, $payload, $productVersion),
            'update_products' => $this->executeUpdateProducts($user, $payload, $productVersion),
            'create_brands', 'update_brands',
            'create_categories', 'update_categories',
            'create_suppliers', 'update_suppliers',
            'create_customers', 'update_customers',
            'create_user_demands',
            'create_storage_locations',
            'create_expense_categories' => $this->executeMasterEntityTask(
                $user,
                $taskType,
                $payload,
                $productVersion,
                (bool) ($payload['user_confirmed'] ?? false)
            ),
            default => $this->buildDeleteBlockedResponse($productVersion),
        };
    }

    /**
     * Detects imperative delete/remove commands (which are strictly forbidden in Cube).
     */
    protected function isDestructiveDeleteCommand(string $lower): bool
    {
        return (bool) preg_match(
            '/^(?:please\s+|cube\s+|plz\s+)?(?:delete|remove|destroy|erase|wipe|truncate|drop)\s+(?:the\s+|this\s+|all\s+|my\s+)?(?:product|products|item|items|medicine|medicines|formulation|formulations|category|categories|brand|brands|supplier|suppliers|customer|customers|invoice|invoices|batch|batches|stock|record|records)\b/iu',
            $lower
        ) || (bool) preg_match(
            '/\b(?:product|medicine|item|record|formulation)\b.*\b(?:delete\s+kar|remove\s+kar|khatam\s+kar|مٹا\s+دیں|ڈیلیٹ\s+کر)\b/iu',
            $lower
        );
    }

    /**
     * Detects if the user is cancelling or denying an active pending task prompt.
     */
    protected function isCancelCommand(string $lower): bool
    {
        return (bool) preg_match(
            '/^(?:please\s+|cube\s+)?(?:no|n|nope|cancel|cancel\s+task|deny|denied|reject|stop|abort|never\s*mind|forget\s+it|skip|don\'?t|do\s+not|nahi|na|mat\s+karo|rahne\s+do|rehne\s+do|choro|نہیں|منسوخ|کینسل|رہنے\s+دو|مت\s+کریں)$/iu',
            trim($lower, " \t\n\r\0\x0B.!?,✕❌")
        );
    }

    /**
     * Detects if the user is granting permission / confirming execution of a pending task.
     */
    protected function isConfirmCommand(string $lower): bool
    {
        $clean = trim($lower, " \t\n\r\0\x0B.!?,✅👍🔒");

        return (bool) preg_match(
            '/^(?:please\s+|cube\s+)?(?:yes|y|yeah|yep|sure|ok|okay|confirm|confirmed|approve|approved|approve\s+and\s+execute|approve\s+and\s+post|approve\s+&\s+post|post\s+to\s+database|allow|allowed|grant\s+permission|give\s+permission|permission\s+granted|proceed|execute|execute\s+task|run\s+task|do\s+it|go\s+ahead|save|save\s+it|create\s+it|update\s+it|apply|apply\s+changes|haan|han|ji|ji\s+haan|jee|jee\s+haan|theek\s+hai|thik\s+hai|kar\s+do|kar\s+dein|ijazat\s+hai|manzoor|ہاں|جی|جی\s+ہاں|منظور|منظور\s+ہے|اجازت\s+ہے|ٹھیک\s+ہے|کر\s+دیں|چلائیں|محفوظ\s+کریں)(?:\s+(?:please|cube|now|task|it|to\s+database|and\s+execute|and\s+execute\s+task|and\s+post|and\s+post\s+to\s+database))?$/iu',
            $clean
        );
    }

    /**
     * Classifies whether a user chat message is an action command for Cube.
     */
    protected function classifyActionIntent(string $lower): ?string
    {
        // 1. Background auto-fill missing formulations across products
        if (
            preg_match('/\b(auto[\s\-]?fill|fill|populate|generate|add|assign|update|set)\b.*\b(formulation|formulations|generic|salt|salts)\b.*\b(missing|empty|all\s+products|multiple\s+products|products|medicines|items|in\s+background|background)\b/iu', $lower) ||
            preg_match('/\b(formulation|formulations|salt|salts)\b.*\b(add\s+kar|fill\s+kar|laga\s+do|laga\s+dein|ڈال\s+دیں|شامل\s+کر)\b/iu', $lower)
        ) {
            if (
                preg_match('/\b(missing|empty|without\s+formulation|all\s+products|my\s+products|in\s+background|background|auto[\s\-]?fill)\b/iu', $lower) ||
                preg_match('/^(?:please\s+|cube\s+)?(?:add|fill|populate|update|assign)\s+formulations?\s+(?:to|for|in)\s+(?:all\s+|my\s+)?products\b/iu', $lower)
            ) {
                return 'bulk_autofill_missing_formulations';
            }

            return 'bulk_assign_formulations';
        }

        // 2. Explicit formulation assignment (e.g. "set formulation Paracetamol for Panadol and Calpol")
        if (
            preg_match('/^(?:please\s+|cube\s+)?(?:set|assign|add|update|change)\s+(?:the\s+)?formulations?\b/iu', $lower) ||
            preg_match('/^(?:please\s+|cube\s+)?add\s+formulations?\s*:/iu', $lower)
        ) {
            return 'bulk_assign_formulations';
        }

        // 3. Create / Add Product(s) command
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:product|products|medicine|medicines|item|items)\b/iu', $lower) ||
            preg_match('/\b(?:new\s+product|product)\s+(?:add|create|banayein|bana\s+do|add\s+kar\s+do|شامل\s+کریں|بنا\s+دیں)\b/iu', $lower)
        ) {
            return 'create_products';
        }

        // 4. Create / Update Expense Category
        if (preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+|an\s+)?(?:new\s+)?expense\s+categor(?:y|ies)\b/iu', $lower)) {
            return 'create_expense_categories';
        }

        // 5. Create Storage Location
        if (preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?storage\s+locations?\b/iu', $lower)) {
            return 'create_storage_locations';
        }

        // 6. Create User / Customer Demand
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|record|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:user\s+|customer\s+|stock\s+)?demands?\b/iu', $lower) ||
            preg_match('/\b(?:new\s+demand|user\s+demand)\s+(?:add|create|likh\s+do|شامل\s+کریں|درج\s+کریں)\b/iu', $lower)
        ) {
            return 'create_user_demands';
        }

        // 7. Create / Update Brand
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:brand|brands|company|manufacturer)\b/iu', $lower) ||
            preg_match('/\b(?:new\s+brand)\s+(?:add|create|banayein|شامل\s+کریں|بنا\s+دیں)\b/iu', $lower)
        ) {
            return 'create_brands';
        }
        if (
            ! preg_match('/\b(product|medicine|item)\b/iu', $lower) &&
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify|rename)\s+(?:the\s+)?(?:brand|manufacturer)\b/iu', $lower)
        ) {
            return 'update_brands';
        }

        // 8. Create / Update Category
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:category|categories)\b/iu', $lower) ||
            preg_match('/\b(?:new\s+category)\s+(?:add|create|banayein|شامل\s+کریں|بنا\s+دیں)\b/iu', $lower)
        ) {
            return 'create_categories';
        }
        if (
            ! preg_match('/\b(product|medicine|item|expense)\b/iu', $lower) &&
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify|rename)\s+(?:the\s+)?category\b/iu', $lower)
        ) {
            return 'update_categories';
        }

        // 9. Create / Update Supplier
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:supplier|suppliers|distributor|vendor)\b/iu', $lower) ||
            preg_match('/\b(?:new\s+supplier)\s+(?:add|create|banayein|شامل\s+کریں|بنا\s+دیں)\b/iu', $lower)
        ) {
            return 'create_suppliers';
        }
        if (
            ! preg_match('/\b(product|medicine|item)\b/iu', $lower) &&
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify)\s+(?:the\s+)?(?:supplier|distributor|vendor)\b/iu', $lower)
        ) {
            return 'update_suppliers';
        }

        // 10. Create / Update Customer
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:customer|customers|patient|client)\b/iu', $lower) ||
            preg_match('/\b(?:new\s+customer)\s+(?:add|create|banayein|شامل\s+کریں|بنا\s+دیں)\b/iu', $lower)
        ) {
            return 'create_customers';
        }
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify)\s+(?:the\s+)?(?:customer|patient|client)\b/iu', $lower)
        ) {
            return 'update_customers';
        }

        // 11. Edit / Update Product(s) command
        if (
            preg_match('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify|set)\s+(?:the\s+)?(?:product|medicine|item|price|pack\s+price|sale\s+price|purchase\s+price|pack\s+size|rack|max\s+discount|category|brand|supplier|formulation)\b/iu', $lower) ||
            preg_match('/\b(?:product|medicine)\s+(?:update|edit|change)\s+(?:kar\s+do|karein|کر\s+دیں)\b/iu', $lower)
        ) {
            return 'update_products';
        }

        return null;
    }

    /**
     * Uses Groq/Gemini AI (with deterministic local regex fallback) to extract structured
     * product creation, product update, or formulation assignment parameters.
     * NEVER assumes or invents any field value not explicitly stated by the user.
     *
     * @return array<string, mixed>
     */
    protected function parseTaskWithAiOrLocal(string $rawText, string $defaultIntent): array
    {
        try {
            if (Schema::hasTable('settings')) {
                Setting::first()?->applyCubeAiConfig();
            }
        } catch (Throwable) {
            // Ignore
        }

        $systemPrompt = <<<'SYSTEM'
You are Cube's structured ERP Task Parser for Karobar-App.
Convert the user's natural-language request into a strict JSON object for NON-DESTRUCTIVE product and formulation tasks.
HARDCODED SAFETY RULE 1: Deleting anything is strictly forbidden. If the user asks to delete or remove anything, set "action": "delete_blocked".
HARDCODED SAFETY RULE 2 (ZERO ASSUMPTIONS): NEVER assume, guess, infer, or default any field value that the user did NOT explicitly state in their message!
- If the user did not explicitly state "pack_size", set "pack_size": null.
- If the user did not explicitly state "category", set "category": null.
- If the user did not explicitly state "brand", set "brand": null.
- If the user did not explicitly state "supplier", set "supplier": null.
- If the user did not explicitly state "formulation", set "formulation": null.
- If the user did not explicitly state prices or rack, set them to null.

Supported actions:
1. "create_products": Adding 1 or more new products.
   Schema:
   {
     "action": "create_products",
     "products": [
       {
         "name": null,
         "formulation": null,
         "pack_size": null,
         "pack_purchase_price": null,
         "pack_sale_price": null,
         "unit_purchase_price": null,
         "unit_sale_price": null,
         "whole_sale_pack_price": null,
         "whole_sale_unit_price": null,
         "category": null,
         "brand": null,
         "supplier": null,
         "rack": null,
         "narcotic": null,
         "max_discount": null,
         "description": null
       }
     ]
   }

2. "update_products": Editing 1 or more existing products. Only include fields the user explicitly wants to change (leave others null).
   Schema:
   {
     "action": "update_products",
     "updates": [
       {
         "target_name_or_code": null,
         "new_name": null,
         "formulation": null,
         "pack_size": null,
         "pack_purchase_price": null,
         "pack_sale_price": null,
         "unit_purchase_price": null,
         "unit_sale_price": null,
         "whole_sale_pack_price": null,
         "whole_sale_unit_price": null,
         "category": null,
         "brand": null,
         "supplier": null,
         "rack": null,
         "narcotic": null,
         "max_discount": null,
         "expiry_warning_days": null,
         "description": null
       }
     ]
   }

3. "bulk_assign_formulations": Setting formulations for specific product names or registering new formulations.
   Schema:
   {
     "action": "bulk_assign_formulations",
     "assignments": [
       {
         "product_name": null,
         "formulation": null
       }
     ],
     "standalone_formulations": []
   }

4. "bulk_autofill_missing_formulations": Auto-filling missing formulations across multiple products in the database.
   Schema:
   {
     "action": "bulk_autofill_missing_formulations",
     "filter_query": ""
   }

5. Master Entity Tasks ("create_brands", "update_brands", "create_categories", "update_categories", "create_suppliers", "update_suppliers", "create_customers", "update_customers", "create_user_demands", "create_storage_locations", "create_expense_categories"):
   Schema:
   {
     "action": "create_brands | update_brands | create_categories | update_categories | create_suppliers | update_suppliers | create_customers | update_customers | create_user_demands | create_storage_locations | create_expense_categories",
     "name": null,
     "target_name": null,
     "new_name": null,
     "phone": null,
     "email": null,
     "address": null,
     "credit_limit": null,
     "credit_days": null,
     "expiry_return_months": null,
     "requested_quantity": null,
     "code": null,
     "default_rack": null,
     "notes": null,
     "description": null
   }

Respond ONLY with the valid JSON object.
SYSTEM;

        $userPrompt = "Default detected intent: {$defaultIntent}\nUser request:\n{$rawText}";

        $localData = $this->parseTaskLocally($rawText, $defaultIntent);
        $aiData = $this->callAiJson($systemPrompt, $userPrompt);
        if (is_array($aiData) && ! empty($aiData['action'])) {
            foreach ($localData as $k => $v) {
                if ((! isset($aiData[$k]) || $aiData[$k] === null || $aiData[$k] === '') && $v !== null && $v !== '') {
                    $aiData[$k] = $v;
                }
            }

            return $aiData;
        }

        // Local deterministic fallback parser when AI is offline or rate-limited
        return $localData;
    }

    /**
     * Local deterministic parser fallback (never assumes any field not stated in `$rawText`).
     *
     * @return array<string, mixed>
     */
    protected function parseTaskLocally(string $rawText, string $defaultIntent): array
    {
        if ($defaultIntent === 'bulk_assign_formulations') {
            $assignments = [];
            $standalone = [];

            if (preg_match('/formulations?\s+(?:of\s+)?([A-Za-z0-9\s\-\+]+?)\s+(?:to|as|=)\s+([A-Za-z0-9\s\-\+\/,]+)/iu', $rawText, $m)) {
                $prodCandidate = trim($m[1]);
                $formCandidate = trim($m[2]);
                if (strtolower($prodCandidate) !== 'product' && strtolower($prodCandidate) !== 'products') {
                    $assignments[] = [
                        'product_name' => $prodCandidate,
                        'formulation' => $formCandidate,
                    ];
                }
            }

            if (empty($assignments) && preg_match('/(?:set|assign|add)\s+formulations?\s+([A-Za-z0-9\s\-\+]+?)\s+(?:for|to|on)\s+(.+)$/iu', $rawText, $m)) {
                $formulation = trim($m[1]);
                $prodList = preg_split('/(?:,|\band\b)/i', $m[2]) ?: [];
                foreach ($prodList as $pName) {
                    $cleanP = trim($pName, " \t\n\r\0\x0B.");
                    $cleanP = preg_replace('/^(?:product|products|medicine|medicines)\s+/i', '', $cleanP) ?? $cleanP;
                    if ($cleanP !== '') {
                        $assignments[] = [
                            'product_name' => $cleanP,
                            'formulation' => $formulation,
                        ];
                    }
                }
            }

            // Detect partial formulation assignment where product was given but formulation was omitted: "set formulation for Panadol"
            if (empty($assignments) && preg_match('/(?:set|assign|add|update|change)\s+(?:the\s+)?formulations?\s+(?:for|of|on)\s+([A-Za-z0-9\s\-\+]+)$/iu', trim($rawText, " \t\n\r\0\x0B.?"), $m)) {
                $prodCandidate = trim($m[1]);
                $prodCandidate = preg_replace('/^(?:product|products|medicine|medicines)\s+/i', '', $prodCandidate) ?? $prodCandidate;
                if ($prodCandidate !== '') {
                    $assignments[] = [
                        'product_name' => $prodCandidate,
                        'formulation' => null,
                    ];
                }
            }

            if (empty($assignments) && preg_match('/add\s+formulations?\s*:\s*(.+)$/iu', $rawText, $m)) {
                $parts = preg_split('/(?:,|\band\b|\n)/i', $m[1]) ?: [];
                foreach ($parts as $part) {
                    $clean = trim($part, " \t\n\r\0\x0B.");
                    if ($clean !== '') {
                        $standalone[] = $clean;
                    }
                }
            }

            return [
                'action' => 'bulk_assign_formulations',
                'assignments' => $assignments,
                'standalone_formulations' => $standalone,
            ];
        }

        if ($defaultIntent === 'create_products') {
            $body = preg_replace('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:product|products|medicine|medicines|item|items)\b\s*(?:named|called|:)?\s*/iu', '', $rawText) ?? $rawText;
            $parsedItem = $this->extractProductFieldsFromText($body, true);

            $hasAnyValue = false;
            foreach ($parsedItem as $v) {
                if ($v !== null && $v !== '') {
                    $hasAnyValue = true;
                    break;
                }
            }

            return [
                'action' => 'create_products',
                'products' => $hasAnyValue ? [$parsedItem] : [],
            ];
        }

        if ($defaultIntent === 'update_products') {
            $body = preg_replace('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify|set)\s+(?:the\s+)?(?:product|medicine|item)?\s*/iu', '', $rawText) ?? $rawText;
            $update = $this->extractUpdateFieldsFromText($body);

            return [
                'action' => 'update_products',
                'updates' => [$update],
            ];
        }

        if (in_array($defaultIntent, [
            'create_brands',
            'update_brands',
            'create_categories',
            'update_categories',
            'create_suppliers',
            'update_suppliers',
            'create_customers',
            'update_customers',
            'create_user_demands',
            'create_storage_locations',
            'create_expense_categories',
        ], true)) {
            return $this->extractMasterEntityFieldsLocally($defaultIntent, $rawText);
        }

        return ['action' => $defaultIntent];
    }

    /**
     * Extracts explicitly stated product fields from natural-language text without assuming any defaults.
     *
     * @return array<string, mixed>
     */
    protected function extractProductFieldsFromText(string $text, bool $treatLeadingUnlabeledAsName = true): array
    {
        $item = [
            'name' => null,
            'formulation' => null,
            'pack_size' => null,
            'pack_purchase_price' => null,
            'pack_sale_price' => null,
            'unit_purchase_price' => null,
            'unit_sale_price' => null,
            'whole_sale_pack_price' => null,
            'whole_sale_unit_price' => null,
            'category' => null,
            'brand' => null,
            'supplier' => null,
            'rack' => null,
            'narcotic' => null,
            'max_discount' => null,
            'description' => null,
        ];

        $working = trim($text);
        if ($working === '') {
            return $item;
        }

        if (preg_match('/(?:product\s+name|name)\s*(?:is|to|=|:)\s*([A-Za-z0-9\s\-\+\(\)\.\/]+?)(?=,|;|\n|\bpack\s*size\b|\bpacking\b|\bpack\s*purchase\b|\bpurchase\s*price\b|\bcost\s*price\b|\bpack\s*sale\b|\bsale\s*price\b|\bretail\s*price\b|\bunit\s*purchase\b|\bunit\s*sale\b|\bformulation\b|\bsalt\b|\bgeneric\b|\bbrand\b|\bmanufacturer\b|\bcategory\b|\bsupplier\b|\bdistributor\b|\bvendor\b|\brack\b|\bnarcotic\b|\bmax\s*discount\b|$)/iu', $working, $m)) {
            $item['name'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:pack\s*size|packing)\s*(?:is|to|=|:)?\s*(\d+)/iu', $working, $m)) {
            $item['pack_size'] = max(1, (int) $m[1]);
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/unit\s*(?:purchase|cost|buy)\s*(?:price|rate|cost)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['unit_purchase_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:pack\s*)?(?:purchase|cost|buy)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['pack_purchase_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:whole\s*sale|wholesale)\s*pack\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['whole_sale_pack_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:whole\s*sale|wholesale)\s*unit\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['whole_sale_unit_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/unit\s*(?:sale|sell|retail|mrp)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['unit_sale_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:pack\s*)?(?:sale|sell|retail|mrp)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $working, $m)) {
            $item['pack_sale_price'] = (float) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:formulation|generic\s*salt|salt|generic)\s*(?:is|to|=|:)?\s*([A-Za-z0-9\s\+\-\/,\(\)]+?)(?=,|;|\n|\bpack\b|\bpacking\b|\bpurchase\b|\bsale\b|\bcost\b|\bprice\b|\bbrand\b|\bmanufacturer\b|\bcategory\b|\bsupplier\b|\bdistributor\b|\bvendor\b|\brack\b|\bnarcotic\b|\bmax\s*discount\b|$)/iu', $working, $m)) {
            $item['formulation'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:brand|manufacturer|company)\s*(?:is|to|=|:)?\s*([A-Za-z0-9\s\-\.&]+?)(?=,|;|\n|\bpack\b|\bpacking\b|\bpurchase\b|\bsale\b|\bcost\b|\bprice\b|\bcategory\b|\bformulation\b|\bsalt\b|\bsupplier\b|\bdistributor\b|\bvendor\b|\brack\b|\bnarcotic\b|\bmax\s*discount\b|$)/iu', $working, $m)) {
            $item['brand'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:category|cat)\s*(?:is|to|=|:)?\s*([A-Za-z0-9\s\-\&]+?)(?=,|;|\n|\bpack\b|\bpacking\b|\bpurchase\b|\bsale\b|\bcost\b|\bprice\b|\bbrand\b|\bmanufacturer\b|\bformulation\b|\bsalt\b|\bsupplier\b|\bdistributor\b|\bvendor\b|\brack\b|\bnarcotic\b|\bmax\s*discount\b|$)/iu', $working, $m)) {
            $item['category'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:supplier|distributor|vendor)\s*(?:is|to|=|:)?\s*([A-Za-z0-9\s\-\.&]+?)(?=,|;|\n|\bpack\b|\bpacking\b|\bpurchase\b|\bsale\b|\bcost\b|\bprice\b|\bbrand\b|\bmanufacturer\b|\bcategory\b|\bformulation\b|\bsalt\b|\brack\b|\bnarcotic\b|\bmax\s*discount\b|$)/iu', $working, $m)) {
            $item['supplier'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/(?:rack|shelf)\s*(?:is|to|=|:)?\s*([A-Za-z0-9\-\/]+)/iu', $working, $m)) {
            $item['rack'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/max\s*discount\s*(?:is|to|=|:)?\s*(\d+)/iu', $working, $m)) {
            $item['max_discount'] = (int) $m[1];
            $working = str_replace($m[0], ' , ', $working);
        }

        if (preg_match('/narcotic\s*(?:is|to|=|:)?\s*(yes|no)/iu', $working, $m)) {
            $item['narcotic'] = strtolower($m[1]);
            $working = str_replace($m[0], ' , ', $working);
        }

        if ($treatLeadingUnlabeledAsName && ($item['name'] === null || $item['name'] === '')) {
            $firstSegment = trim(explode(',', $working)[0] ?? '');
            $firstSegment = preg_replace('/\b(?:and|with|having)\s*$/iu', '', $firstSegment) ?? $firstSegment;
            $firstSegment = trim(preg_replace('/\s+/', ' ', $firstSegment) ?? $firstSegment, " \t\n\r\0\x0B.,:-");
            if ($firstSegment !== '') {
                $item['name'] = $firstSegment;
            }
        }

        return $item;
    }

    /**
     * Extracts explicitly stated update fields from text without assuming any values.
     *
     * @return array<string, mixed>
     */
    protected function extractUpdateFieldsFromText(string $body): array
    {
        $extracted = $this->extractProductFieldsFromText($body, false);

        $target = '';
        if (preg_match('/\b(PRD-\d+)\b/i', $body, $m)) {
            $target = strtoupper($m[1]);
        } else {
            // Strip recognized field clauses to isolate the product target name
            $stripped = preg_replace(
                '/\b(?:pack\s*size|packing|unit\s*purchase\s*price|pack\s*purchase\s*price|purchase\s*price|cost\s*price|unit\s*sale\s*price|pack\s*sale\s*price|sale\s*price|retail\s*price|whole\s*sale\s*pack\s*price|whole\s*sale\s*unit\s*price|formulation|generic\s*salt|salt|generic|brand|manufacturer|category|supplier|distributor|vendor|rack|shelf|max\s*discount|narcotic)\b.*$/iu',
                '',
                $body
            ) ?? $body;
            $stripped = preg_replace('/\b(for|of|on|to|and|set|change|update|edit|product|medicine|item)\b/iu', ' ', $stripped) ?? $stripped;
            $target = trim(preg_replace('/\s+/', ' ', $stripped) ?? '', " \t\n\r\0\x0B.,:-");
        }

        $update = [
            'target_name_or_code' => $target !== '' ? $target : null,
        ];

        foreach ($extracted as $k => $v) {
            if ($k === 'name') {
                continue;
            }
            if ($v !== null && $v !== '') {
                $update[$k] = $v;
            }
        }

        if (preg_match('/(?:rename\s+to|new\s+name\s*(?:is|to|=|:)?)\s*([A-Za-z0-9\s\-\+\(\)\.]+?)(?=,|;|\n|$)/iu', $body, $m)) {
            $update['new_name'] = trim($m[1], " \t\n\r\0\x0B.,:-");
        }

        return $update;
    }

    /**
     * Strictly verifies AI-extracted product fields against the actual text typed by the user.
     * Prevents any LLM from assuming or guessing `pack_size`, `category`, `brand`, `supplier`,
     * or `formulation` from world knowledge when the user did not state them.
     *
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    protected function verifyExtractedFieldsAgainstUserText(array $item, string $userText): array
    {
        $placeholders = ['null', 'n/a', 'na', 'none', 'unknown', 'default', 'not specified', 'unspecified', 'tbd', '?', '-'];
        $lowerText = mb_strtolower($userText, 'UTF-8');

        foreach (['name', 'formulation', 'category', 'brand', 'supplier', 'rack', 'description'] as $strKey) {
            if (! isset($item[$strKey])) {
                $item[$strKey] = null;
                continue;
            }
            $val = trim((string) $item[$strKey]);
            if ($val === '' || in_array(mb_strtolower($val, 'UTF-8'), $placeholders, true)) {
                $item[$strKey] = null;
            } else {
                $item[$strKey] = $val;
            }
        }

        // Verify `brand`: must appear in the user's text
        if ($item['brand'] !== null) {
            $brandLower = mb_strtolower($item['brand'], 'UTF-8');
            if (! str_contains($lowerText, $brandLower)) {
                $item['brand'] = null;
            }
        }

        // Verify `supplier`: must appear in the user's text
        if ($item['supplier'] !== null) {
            $supLower = mb_strtolower($item['supplier'], 'UTF-8');
            if (! str_contains($lowerText, $supLower)) {
                $item['supplier'] = null;
            }
        }

        // Verify `formulation`: when creating a product, formulation must be stated by the user, not guessed
        if ($item['formulation'] !== null) {
            $formLower = mb_strtolower($item['formulation'], 'UTF-8');
            $productNameLower = mb_strtolower((string) ($item['name'] ?? ''), 'UTF-8');
            $hasFormulationKeyword = (bool) preg_match('/\b(formulation|salt|generic)\b/iu', $lowerText);
            if (! str_contains($lowerText, $formLower) || (! $hasFormulationKeyword && str_contains($productNameLower, $formLower))) {
                $item['formulation'] = null;
            }
        }

        // Verify `category`: must be explicitly mentioned by the user (not inferred from "Tablet" inside the product name)
        if ($item['category'] !== null) {
            $catLower = mb_strtolower($item['category'], 'UTF-8');
            $hasCategoryKeyword = (bool) preg_match('/\b(category|cat|کیٹیگری)\b/iu', $lowerText);
            if (! str_contains($lowerText, $catLower)) {
                $item['category'] = null;
            } elseif (! $hasCategoryKeyword && $item['name'] !== null) {
                $textWithoutName = str_replace(mb_strtolower($item['name'], 'UTF-8'), ' ', $lowerText);
                if (! str_contains($textWithoutName, $catLower)) {
                    $item['category'] = null;
                }
            }
        }

        // Verify `pack_size`: must be an explicit integer in user text outside dosage strength (e.g. 500mg, 120ml)
        if (isset($item['pack_size']) && $item['pack_size'] !== null && $item['pack_size'] !== '') {
            $packVal = (int) $item['pack_size'];
            $textWithoutStrengths = preg_replace('/\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|kg|iu|%)\b/iu', ' ', $lowerText) ?? $lowerText;
            if ($packVal < 1 || ! preg_match('/\b'.preg_quote((string) $packVal, '/').'\b/', $textWithoutStrengths)) {
                $item['pack_size'] = null;
            } else {
                $item['pack_size'] = $packVal;
            }
        } else {
            $item['pack_size'] = null;
        }

        return $item;
    }

    /**
     * Validates that any non-empty `brand` and `supplier` values in a product draft match
     * an EXISTING Brand / Supplier record in the database.
     * Cube NEVER creates a new Brand or Supplier when adding a product.
     * If a provided brand/supplier does not exist in the catalog, its value is stored in
     * `_invalid_brand` / `_invalid_supplier` and `brand` / `supplier` is reset to null so
     * the user is asked to choose an existing brand/supplier.
     *
     * @param  array<string, mixed>  $draft
     * @return array<string, mixed>
     */
    protected function validateCreateProductCatalogLinks(array $draft): array
    {
        $brandInput = trim((string) ($draft['brand'] ?? ''));
        if ($brandInput !== '') {
            $existingBrand = $this->findExistingBrand($brandInput);
            if ($existingBrand) {
                $draft['brand'] = $existingBrand->name;
                unset($draft['_invalid_brand']);
            } else {
                $draft['_invalid_brand'] = $brandInput;
                $draft['brand'] = null;
            }
        }

        $supplierInput = trim((string) ($draft['supplier'] ?? ''));
        if ($supplierInput !== '') {
            $existingSupplier = $this->findExistingSupplier($supplierInput);
            if ($existingSupplier) {
                $draft['supplier'] = $existingSupplier->name;
                unset($draft['_invalid_supplier']);
            } else {
                $draft['_invalid_supplier'] = $supplierInput;
                $draft['supplier'] = null;
            }
        }

        return $draft;
    }

    /**
     * Returns the list of required field keys (`name`, `pack_size`, `category`, `brand`, `supplier`)
     * that are still missing or do not match an existing catalog Brand/Supplier for a product draft.
     *
     * @param  array<string, mixed>  $rawItem
     * @return array<int, string>
     */
    protected function getMissingCreateProductFields(array $rawItem): array
    {
        $missing = [];

        if (trim((string) ($rawItem['name'] ?? '')) === '') {
            $missing[] = 'name';
        }

        $packSize = $rawItem['pack_size'] ?? null;
        if ($packSize === null || $packSize === '' || ! is_numeric($packSize) || (int) $packSize < 1) {
            $missing[] = 'pack_size';
        }

        if (trim((string) ($rawItem['category'] ?? '')) === '') {
            $missing[] = 'category';
        }

        $brandVal = trim((string) ($rawItem['brand'] ?? ''));
        if ($brandVal === '' || $this->findExistingBrand($brandVal) === null) {
            $missing[] = 'brand';
        }

        $supplierVal = trim((string) ($rawItem['supplier'] ?? ''));
        if ($supplierVal === '' || $this->findExistingSupplier($supplierVal) === null) {
            $missing[] = 'supplier';
        }

        return $missing;
    }

    /**
     * Continues an active pending task when the user replies with missing required fields.
     *
     * @param  array<string, mixed>  $pendingTask
     * @return array<string, mixed>
     */
    protected function continuePendingTask(User $user, array $pendingTask, string $replyText, string $productVersion, bool $userConfirmed = false): array
    {
        $action = (string) ($pendingTask['action'] ?? '');

        if ($action === 'create_products') {
            $drafts = is_array($pendingTask['products'] ?? null) && ! empty($pendingTask['products'])
                ? $pendingTask['products']
                : [[]];

            // Target the first incomplete product draft in the pending queue
            $targetIdx = 0;
            foreach ($drafts as $idx => $d) {
                if (! empty($this->getMissingCreateProductFields(is_array($d) ? $d : []))) {
                    $targetIdx = $idx;
                    break;
                }
            }

            $currentDraft = is_array($drafts[$targetIdx] ?? null) ? $drafts[$targetIdx] : [];
            $missingBefore = $this->getMissingCreateProductFields($currentDraft);

            $mergedDraft = $this->mergeReplyIntoProductDraft($currentDraft, $missingBefore, $replyText);
            $drafts[$targetIdx] = $mergedDraft;

            return $this->executeCreateProducts($user, [
                'products' => $drafts,
                'user_confirmed' => $userConfirmed,
            ], $productVersion);
        }

        if ($action === 'update_products') {
            $updates = is_array($pendingTask['updates'] ?? null) && ! empty($pendingTask['updates'])
                ? $pendingTask['updates']
                : [[]];
            $currentUpdate = is_array($updates[0] ?? null) ? $updates[0] : [];

            if (preg_match('/^(?:select\s+(?:product|existing)\s*#(\d+)|#(\d+))/iu', trim($replyText), $selM)) {
                $selId = (int) ($selM[1] ?: ($selM[2] ?? 0));
                $foundP = Product::find($selId);
                if ($foundP) {
                    $currentUpdate['target_name_or_code'] = $foundP->name;
                    $updates[0] = $currentUpdate;

                    return $this->executeUpdateProducts($user, [
                        'updates' => $updates,
                        'user_confirmed' => $userConfirmed,
                    ], $productVersion);
                }
            }

            $newExtracted = $this->extractUpdateFieldsFromText($replyText);
            foreach ($newExtracted as $k => $v) {
                if ($v !== null && $v !== '') {
                    if ($k === 'target_name_or_code' && ! empty($currentUpdate['target_name_or_code'])) {
                        continue;
                    }
                    $currentUpdate[$k] = $v;
                }
            }

            // If target was missing and user just typed the product name
            if (empty($currentUpdate['target_name_or_code'])) {
                $cleanReply = trim($replyText, " \t\n\r\0\x0B.,:-");
                if ($cleanReply !== '') {
                    $currentUpdate['target_name_or_code'] = $cleanReply;
                }
            }

            $updates[0] = $currentUpdate;

            return $this->executeUpdateProducts($user, [
                'updates' => $updates,
                'user_confirmed' => $userConfirmed,
            ], $productVersion);
        }

        if ($action === 'bulk_assign_formulations') {
            $assignments = is_array($pendingTask['assignments'] ?? null) && ! empty($pendingTask['assignments'])
                ? $pendingTask['assignments']
                : [['product_name' => null, 'formulation' => null]];
            $currentAssign = is_array($assignments[0] ?? null) ? $assignments[0] : ['product_name' => null, 'formulation' => null];

            $parsedFollowUp = $this->parseTaskLocally($replyText, 'bulk_assign_formulations');
            if (! empty($parsedFollowUp['assignments'][0])) {
                $fa = $parsedFollowUp['assignments'][0];
                if (! empty($fa['product_name'])) {
                    $currentAssign['product_name'] = $fa['product_name'];
                }
                if (! empty($fa['formulation'])) {
                    $currentAssign['formulation'] = $fa['formulation'];
                }
            } else {
                $cleanVal = trim($replyText, " \t\n\r\0\x0B.,:-");
                if (empty($currentAssign['product_name']) && ! empty($currentAssign['formulation'])) {
                    $currentAssign['product_name'] = $cleanVal;
                } elseif (! empty($currentAssign['product_name']) && empty($currentAssign['formulation'])) {
                    $currentAssign['formulation'] = $cleanVal;
                }
            }

            $assignments[0] = $currentAssign;

            return $this->executeBulkAssignFormulations($user, [
                'assignments' => $assignments,
                'standalone_formulations' => [],
                'user_confirmed' => $userConfirmed,
            ], $productVersion, $replyText);
        }

        if (in_array($action, [
            'create_brands', 'update_brands',
            'create_categories', 'update_categories',
            'create_suppliers', 'update_suppliers',
            'create_customers', 'update_customers',
            'create_user_demands',
            'create_storage_locations',
            'create_expense_categories',
        ], true)) {
            $mergedPayload = $this->mergeMasterEntityReply($action, is_array($pendingTask['payload'] ?? null) ? $pendingTask['payload'] : [], $replyText);

            return $this->executeMasterEntityTask($user, $action, $mergedPayload, $productVersion, $userConfirmed);
        }

        $this->clearPendingTask($user);

        return $this->buildTaskCancelledResponse($productVersion);
    }

    /**
     * Merges a user's follow-up reply (whether labeled, natural sentence, comma-separated, or single bare value)
     * into an existing product draft without assuming any unstated fields.
     *
     * @param  array<string, mixed>  $draft
     * @param  array<int, string>  $missingBefore
     * @return array<string, mixed>
     */
    protected function mergeReplyIntoProductDraft(array $draft, array $missingBefore, string $replyText): array
    {
        unset($draft['_invalid_brand'], $draft['_invalid_supplier']);

        $trimmedReply = trim($replyText);
        $lowerReply = mb_strtolower($trimmedReply, 'UTF-8');

        // Handle DB disambiguation choices when matching products were found in the database
        if (preg_match('/^(?:select\s+(?:existing|product)\s*#(\d+)|use\s+existing(?:\s*#(\d+))?|#(\d+))/iu', $trimmedReply, $selMatch)) {
            $selId = (int) ($selMatch[1] ?: ($selMatch[2] ?: ($selMatch[3] ?? 0)));
            if ($selId > 0) {
                $draft['_use_existing_product_id'] = $selId;
            } else {
                $draft['_use_existing_product_id'] = -1;
            }

            return $draft;
        }

        if (preg_match('/^(?:edit\s+(?:existing|product)(?:\s*#(\d+))?)/iu', $trimmedReply, $editMatch)) {
            $editId = (int) ($editMatch[1] ?? 0);
            $draft['_edit_existing_product_id'] = $editId > 0 ? $editId : -1;

            return $draft;
        }

        if (preg_match('/^(?:create\s+(?:as\s+)?new(?:\s+product)?(?:\s+anyway)?|add\s+as\s+new(?:\s+product)?|confirm\s+create\s+new|create\s+new\s+anyway|new\s+product)$/iu', $lowerReply)) {
            $draft['_confirmed_new_product'] = true;

            return $draft;
        }

        $cleanReply = preg_replace('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make)\s+(?:a\s+)?(?:new\s+)?(?:product|products|medicine|medicines|item|items)\b\s*(?:named|called|:)?\s*/iu', '', $replyText) ?? $replyText;

        // 1. Extract explicitly labeled fields first
        $labeled = $this->extractProductFieldsFromText($cleanReply, false);
        foreach ($labeled as $key => $val) {
            if ($val !== null && $val !== '') {
                $draft[$key] = $val;
            }
        }

        // 2. Determine which required fields are still missing after labeled extraction
        $stillMissing = $this->getMissingCreateProductFields($draft);
        if (empty($stillMissing)) {
            return $draft;
        }

        // 3. Remove labeled clauses from `$cleanReply` to see if the user provided unlabeled values (e.g. "200, Tablets, GSK, Ali Gohar" or "200")
        $remainingText = $cleanReply;
        $labeledPatterns = [
            '/(?:product\s+name|name)\s*(?:is|to|=|:)\s*[A-Za-z0-9\s\-\+\(\)\.\/]+?(?=,|;|\n|\bpack\b|\bcategory\b|\bbrand\b|\bsupplier\b|$)/iu',
            '/(?:pack\s*size|packing)\s*(?:is|to|=|:)?\s*\d+/iu',
            '/unit\s*(?:purchase|cost|buy)\s*(?:price|rate|cost)?\s*(?:is|to|=|:)?\s*\d+(?:\.\d+)?/iu',
            '/(?:pack\s*)?(?:purchase|cost|buy)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*\d+(?:\.\d+)?/iu',
            '/(?:whole\s*sale|wholesale)\s*(?:pack|unit)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*\d+(?:\.\d+)?/iu',
            '/unit\s*(?:sale|sell|retail|mrp)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*\d+(?:\.\d+)?/iu',
            '/(?:pack\s*)?(?:sale|sell|retail|mrp)\s*(?:price|rate)?\s*(?:is|to|=|:)?\s*\d+(?:\.\d+)?/iu',
            '/(?:formulation|generic\s*salt|salt|generic)\s*(?:is|to|=|:)?\s*[A-Za-z0-9\s\+\-\/,\(\)]+?(?=,|;|\n|\bpack\b|\bbrand\b|\bcategory\b|\bsupplier\b|\brack\b|$)/iu',
            '/(?:brand|manufacturer|company)\s*(?:is|to|=|:)?\s*[A-Za-z0-9\s\-\.&]+?(?=,|;|\n|\bpack\b|\bcategory\b|\bformulation\b|\bsupplier\b|\brack\b|$)/iu',
            '/(?:category|cat)\s*(?:is|to|=|:)?\s*[A-Za-z0-9\s\-\&]+?(?=,|;|\n|\bpack\b|\bbrand\b|\bformulation\b|\bsupplier\b|\brack\b|$)/iu',
            '/(?:supplier|distributor|vendor)\s*(?:is|to|=|:)?\s*[A-Za-z0-9\s\-\.&]+?(?=,|;|\n|\bpack\b|\bbrand\b|\bcategory\b|\bformulation\b|\brack\b|$)/iu',
            '/(?:rack|shelf)\s*(?:is|to|=|:)?\s*[A-Za-z0-9\-\/]+/iu',
            '/max\s*discount\s*(?:is|to|=|:)?\s*\d+/iu',
            '/narcotic\s*(?:is|to|=|:)?\s*(?:yes|no)/iu',
        ];
        foreach ($labeledPatterns as $pat) {
            $remainingText = preg_replace($pat, ' , ', $remainingText) ?? $remainingText;
        }

        $unlabeledTokens = array_values(array_filter(array_map(
            fn ($t) => trim(preg_replace('/^(?:and|is|=|:)\s+/iu', '', trim($t)) ?? '', " \t\n\r\0\x0B.,:-"),
            preg_split('/[,;\n]+/', $remainingText) ?: []
        ), fn ($t) => $t !== ''));

        foreach ($unlabeledTokens as $token) {
            $stillMissing = $this->getMissingCreateProductFields($draft);
            if (empty($stillMissing)) {
                break;
            }

            // If token is a pure positive integer (e.g. "200") and `pack_size` is among the missing fields
            if (preg_match('/^(\d+)(?:\s*(?:units?|tabs?|tablets?|caps?|packs?|pcs?))?$/iu', $token, $numMatch) && in_array('pack_size', $stillMissing, true)) {
                $draft['pack_size'] = max(1, (int) $numMatch[1]);
                continue;
            }

            // Assign to the next non-numeric missing field (`name`, `category`, `brand`, `supplier`)
            foreach ($stillMissing as $missingField) {
                if ($missingField === 'pack_size') {
                    continue;
                }
                if (trim((string) ($draft[$missingField] ?? '')) === '') {
                    // Don't overwrite `name` if token is identical to already set `name`
                    if ($missingField !== 'name' && isset($draft['name']) && mb_strtolower($token, 'UTF-8') === mb_strtolower((string) $draft['name'], 'UTF-8')) {
                        break;
                    }
                    $draft[$missingField] = $token;
                    break;
                }
            }
        }

        return $draft;
    }

    /**
     * Executes creation of 1 or multiple products (non-destructive).
     * NEVER assumes missing required fields (`name`, `pack_size`, `category`, `brand`, `supplier`).
     * NEVER creates a new Brand or Supplier — `brand` and `supplier` must match existing records.
     * Searches the database first for matching products so duplicates are not excessively created.
     *
     * @param  array<string, mixed>  $taskData
     * @return array<string, mixed>
     */
    protected function executeCreateProducts(User $user, array $taskData, string $productVersion): array
    {
        if (! $this->canCreateProducts($user)) {
            return $this->buildPermissionDeniedResponse('product.create', $productVersion);
        }

        $rawItems = is_array($taskData['products'] ?? null) ? array_values(array_filter($taskData['products'], 'is_array')) : [];

        // If user asked to "Add a product" without providing any fields yet, start an empty draft and ask Step 1 (Product Name)
        if (empty($rawItems)) {
            $emptyDraft = [
                [
                    'name' => null,
                    'pack_size' => null,
                    'category' => null,
                    'brand' => null,
                    'supplier' => null,
                ],
            ];
            $this->savePendingTask($user, [
                'action' => 'create_products',
                'products' => $emptyDraft,
            ]);

            return $this->buildMissingCreateProductFieldsResponse($emptyDraft, $productVersion);
        }

        // Validate that any provided `brand` and `supplier` exist in the catalog (never create new Brand or Supplier)
        foreach ($rawItems as $idx => $candidate) {
            $rawItems[$idx] = $this->validateCreateProductCatalogLinks($candidate);
        }

        // Handle user selection if they chose to use or edit an existing product found in DB
        $firstCandidate = $rawItems[0] ?? [];
        if (! empty($firstCandidate['_use_existing_product_id'])) {
            $selId = (int) $firstCandidate['_use_existing_product_id'];
            $existingProd = $selId > 0
                ? Product::with(['brand:id,name', 'category:id,name'])->find($selId)
                : ($this->findProductByNameOrCode((string) ($firstCandidate['name'] ?? '')));

            if ($existingProd) {
                $this->clearPendingTask($user);

                return $this->formatTaskResponse(
                    titleEn: "✅ Selected Existing Product from Database: {$existingProd->name}",
                    titleUr: "✅ ڈیٹا بیس سے موجودہ پروڈکٹ منتخب کر لی گئی: {$existingProd->name}",
                    answerEn: "✅ **Selected Existing Product (No Duplicate Created):**\n- **{$existingProd->name}** (`{$existingProd->product_code}`) • Stock: `{$existingProd->quantity}` • Pack Sale: `Rs. {$existingProd->pack_sale_price}`",
                    answerUr: "✅ **موجودہ پروڈکٹ منتخب کر لی گئی (نئی ڈپلیکیٹ پروڈکٹ نہیں بنائی گئی):**\n- **{$existingProd->name}** (`{$existingProd->product_code}`)",
                    links: [
                        ['path' => '/products/'.$existingProd->id.'/edit', 'en' => 'Open '.$existingProd->name, 'ur' => $existingProd->name.' کھولیں'],
                        ['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں'],
                    ],
                    taskMeta: [
                        'action' => 'create_products',
                        'status' => 'selected_existing',
                        'created_count' => 0,
                        'selected_existing' => [
                            'id' => $existingProd->id,
                            'code' => $existingProd->product_code,
                            'name' => $existingProd->name,
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_executed'
                );
            }
        }

        if (! empty($firstCandidate['_edit_existing_product_id'])) {
            $editId = (int) $firstCandidate['_edit_existing_product_id'];
            $existingProd = $editId > 0
                ? Product::find($editId)
                : ($this->findProductByNameOrCode((string) ($firstCandidate['name'] ?? '')));

            if ($existingProd) {
                return $this->executeUpdateProducts($user, [
                    'updates' => [
                        ['target_name_or_code' => $existingProd->name],
                    ],
                ], $productVersion);
            }
        }

        // DB-First Check: Before asking for remaining fields or creating a new product, search `products` table for matching records!
        if (count($rawItems) === 1) {
            $candidateName = trim((string) ($firstCandidate['name'] ?? ''));
            if ($candidateName !== '' && empty($firstCandidate['_confirmed_new_product'])) {
                $dbMatches = $this->searchMatchingProductsInDb($candidateName, 5);
                if (! empty($dbMatches)) {
                    $this->savePendingTask($user, [
                        'action' => 'create_products',
                        'status' => 'resolve_db_matches',
                        'products' => $rawItems,
                    ]);

                    return $this->buildExistingProductMatchesStepResponse($firstCandidate, $dbMatches, $productVersion);
                }
                // Mark as checked so subsequent field replies don't re-query if 0 matches existed
                $rawItems[0]['_confirmed_new_product'] = true;
            }
        }

        // Check if any product in the request is missing any required field (`name`, `pack_size`, `category`, `brand`, `supplier`)
        $hasMissingRequiredFields = false;
        foreach ($rawItems as $candidate) {
            $candidateName = trim((string) ($candidate['name'] ?? ''));
            if ($candidateName !== '' && count($rawItems) > 1) {
                $existingProd = Product::query()->whereRaw('LOWER(name) = ?', [mb_strtolower($candidateName, 'UTF-8')])->first();
                if ($existingProd) {
                    continue;
                }
            }
            if (! empty($this->getMissingCreateProductFields($candidate))) {
                $hasMissingRequiredFields = true;
                break;
            }
        }

        if ($hasMissingRequiredFields) {
            $this->savePendingTask($user, [
                'action' => 'create_products',
                'status' => 'needs_required_fields',
                'products' => $rawItems,
            ]);

            return $this->buildMissingCreateProductFieldsResponse($rawItems, $productVersion);
        }

        // Always ask for explicit user permission before executing product creation
        $userConfirmed = (bool) ($taskData['user_confirmed'] ?? false);
        if (! $userConfirmed) {
            $this->savePendingTask($user, [
                'action' => 'create_products',
                'status' => 'awaiting_permission',
                'awaiting_permission' => true,
                'products' => $rawItems,
            ]);

            return $this->buildCreateProductsPermissionResponse($rawItems, $productVersion);
        }

        // All required fields are present, Brand/Supplier exist, and User Granted Permission! Clear pending task and create product(s).
        $this->clearPendingTask($user);

        $created = [];
        $alreadyExisted = [];

        foreach (array_slice($rawItems, 0, 25) as $rawItem) {
            $name = trim((string) ($rawItem['name'] ?? ''));
            if ($name === '') {
                continue;
            }

            // Check if product already exists by case-insensitive name
            $existing = Product::query()->whereRaw('LOWER(name) = ?', [mb_strtolower($name, 'UTF-8')])->first();
            if ($existing) {
                $explicitForm = trim((string) ($rawItem['formulation'] ?? ''));
                if (empty($existing->formulation) && $explicitForm !== '') {
                    $resolvedF = Formulation::resolveOrCreate($explicitForm);
                    $existing->formulation = $resolvedF?->name ?? $explicitForm;
                    $existing->save();
                }
                $alreadyExisted[] = [
                    'id' => $existing->id,
                    'product_code' => $existing->product_code,
                    'name' => $existing->name,
                    'formulation' => $existing->formulation,
                ];
                continue;
            }

            $codeAndBarcode = $this->generateUniqueCodeAndBarcode();
            $packSize = (int) $rawItem['pack_size'];

            $packPurchase = isset($rawItem['pack_purchase_price']) && is_numeric($rawItem['pack_purchase_price'])
                ? round((float) $rawItem['pack_purchase_price'], 2)
                : null;
            $unitPurchase = isset($rawItem['unit_purchase_price']) && is_numeric($rawItem['unit_purchase_price'])
                ? round((float) $rawItem['unit_purchase_price'], 2)
                : null;

            if ($packPurchase !== null && $unitPurchase === null) {
                $unitPurchase = round($packPurchase / $packSize, 2);
            } elseif ($unitPurchase !== null && $packPurchase === null) {
                $packPurchase = round($unitPurchase * $packSize, 2);
            }

            $packSale = isset($rawItem['pack_sale_price']) && is_numeric($rawItem['pack_sale_price'])
                ? round((float) $rawItem['pack_sale_price'], 2)
                : null;
            $unitSale = isset($rawItem['unit_sale_price']) && is_numeric($rawItem['unit_sale_price'])
                ? round((float) $rawItem['unit_sale_price'], 2)
                : null;

            if ($packSale !== null && $unitSale === null) {
                $unitSale = round($packSale / $packSize, 2);
            } elseif ($unitSale !== null && $packSale === null) {
                $packSale = round($unitSale * $packSize, 2);
            }

            // Never assume formulation when adding a product unless explicitly provided by the user
            $rawFormulation = trim((string) ($rawItem['formulation'] ?? ''));
            $resolvedFormulation = $rawFormulation !== '' ? Formulation::resolveOrCreate($rawFormulation) : null;

            $categoryName = trim((string) $rawItem['category']);
            $category = $this->resolveOrCreateCategory($categoryName);

            // Strictly use existing Brand and Supplier (validated above; never create new Brand or Supplier)
            $brandName = trim((string) $rawItem['brand']);
            $brand = $this->findExistingBrand($brandName);

            $supplierName = trim((string) $rawItem['supplier']);
            $supplier = $this->findExistingSupplier($supplierName);

            if (! $brand || ! $supplier) {
                continue;
            }

            $storageLocationId = null;
            if (Schema::hasTable('storage_locations')) {
                $storageLocationId = StorageLocation::where('is_default', true)->value('id')
                    ?? StorageLocation::orderBy('id')->value('id');
            }

            $avgPrice = $unitPurchase ?? 0.0;
            $margin = ($unitSale !== null && $unitSale > 0 && $avgPrice > 0)
                ? round((($unitSale - $avgPrice) / $unitSale) * 100, 2)
                : 0.0;

            $product = Product::create([
                'product_code' => $codeAndBarcode['product_code'],
                'barcode' => $codeAndBarcode['barcode'],
                'name' => $name,
                'formulation' => $resolvedFormulation?->name,
                'description' => isset($rawItem['description']) ? trim((string) $rawItem['description']) : null,
                'pack_size' => $packSize,
                'quantity' => 0,
                'pack_purchase_price' => $packPurchase ?? 0,
                'unit_purchase_price' => $unitPurchase ?? 0,
                'pack_sale_price' => $packSale ?? 0,
                'unit_sale_price' => $unitSale ?? 0,
                'whole_sale_pack_price' => isset($rawItem['whole_sale_pack_price']) && is_numeric($rawItem['whole_sale_pack_price'])
                    ? round((float) $rawItem['whole_sale_pack_price'], 2)
                    : ($packSale ?? 0),
                'whole_sale_unit_price' => isset($rawItem['whole_sale_unit_price']) && is_numeric($rawItem['whole_sale_unit_price'])
                    ? round((float) $rawItem['whole_sale_unit_price'], 2)
                    : ($unitSale ?? 0),
                'avg_price' => $avgPrice,
                'margin' => $margin,
                'whole_sale_margin' => $margin,
                'narcotic' => in_array(($rawItem['narcotic'] ?? 'no'), ['yes', 'no'], true) ? ($rawItem['narcotic'] ?? 'no') : 'no',
                'max_discount' => isset($rawItem['max_discount']) && is_numeric($rawItem['max_discount']) ? (int) $rawItem['max_discount'] : 0,
                'expiry_warning_days' => isset($rawItem['expiry_warning_days']) && is_numeric($rawItem['expiry_warning_days']) ? (int) $rawItem['expiry_warning_days'] : 90,
                'category_id' => $category->id,
                'brand_id' => $brand->id,
                'supplier_id' => $supplier->id,
                'rack' => isset($rawItem['rack']) ? trim((string) $rawItem['rack']) : null,
                'storage_location_id' => $storageLocationId,
            ]);

            if (! empty($product->supplier_id) && Schema::hasTable('product_suppliers')) {
                ProductSupplier::updateOrCreate(
                    ['product_id' => $product->id, 'supplier_id' => $product->supplier_id],
                    [
                        'last_purchase_price' => $product->unit_purchase_price,
                        'is_preferred' => true,
                    ]
                );
            }

            $created[] = [
                'id' => $product->id,
                'product_code' => $product->product_code,
                'name' => $product->name,
                'formulation' => $product->formulation,
                'pack_size' => $product->pack_size,
                'pack_purchase_price' => $product->pack_purchase_price,
                'pack_sale_price' => $product->pack_sale_price,
                'category' => $category->name,
                'brand' => $brand->name,
                'supplier' => $supplier->name,
                'rack' => $product->rack,
            ];
        }

        $linesEn = [];
        $linesUr = [];

        if (! empty($created)) {
            $linesEn[] = '✅ **Cube AI Task Completed — Created '.count($created).' Product(s):**';
            $linesUr[] = '✅ **کیوب اے آئی نے '.count($created).' نئی پروڈکٹ(س) کامیابی سے شامل کر دیں:**';

            foreach ($created as $idx => $c) {
                $num = $idx + 1;
                $formStr = $c['formulation'] ? " • Formulation: **{$c['formulation']}**" : '';
                $linesEn[] = "{$num}. **{$c['name']}** (`{$c['product_code']}`){$formStr} • Pack Size: `{$c['pack_size']}` • Category: `{$c['category']}` • Brand: `{$c['brand']}` • Supplier: `{$c['supplier']}` • Pack Sale: `{$c['pack_sale_price']}`";
                $linesUr[] = "{$num}. **{$c['name']}** (`{$c['product_code']}`){$formStr} • پیک سائز: `{$c['pack_size']}` • کیٹیگری: `{$c['category']}` • برانڈ: `{$c['brand']}` • سپلائر: `{$c['supplier']}`";
            }
        }

        if (! empty($alreadyExisted)) {
            $names = implode(', ', array_map(fn ($e) => "**{$e['name']}** (`{$e['product_code']}`)", $alreadyExisted));
            $linesEn[] = "ℹ️ Already in catalog (skipped duplicate creation): {$names}";
            $linesUr[] = "ℹ️ یہ پروڈکٹس پہلے سے موجود ہیں: {$names}";
        }

        $links = [
            ['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں'],
        ];
        if (count($created) === 1) {
            $links[] = [
                'path' => '/products/'.$created[0]['id'].'/edit',
                'en' => 'Edit '.$created[0]['name'],
                'ur' => $created[0]['name'].' ایڈٹ کریں',
            ];
        }

        return $this->formatTaskResponse(
            titleEn: count($created) > 0
                ? 'Added '.count($created).' Product(s) to Catalog'
                : 'Product Already Exists in Catalog',
            titleUr: count($created) > 0
                ? count($created).' نئی پروڈکٹ(س) کیٹلاگ میں شامل کر دی گئیں'
                : 'پروڈکٹ پہلے سے کیٹلاگ میں موجود ہے',
            answerEn: implode("\n\n", $linesEn),
            answerUr: implode("\n\n", $linesUr),
            links: $links,
            taskMeta: [
                'action' => 'create_products',
                'status' => 'completed',
                'permission_granted' => true,
                'created_count' => count($created),
                'created_products' => $created,
                'already_existed' => $alreadyExisted,
                'refresh_products' => true,
                'result_summary' => [
                    'action_label' => [
                        'en' => 'Created '.count($created).' Product(s)',
                        'ur' => count($created).' نئی پروڈکٹ(س) شامل کی گئیں',
                    ],
                    'affected_count' => count($created),
                    'items' => array_map(fn (array $c): array => [
                        'id' => $c['id'],
                        'code' => $c['product_code'],
                        'name' => $c['name'],
                        'details_en' => 'Pack Size: '.$c['pack_size'].' • Category: '.$c['category'].' • Brand: '.$c['brand'].' • Supplier: '.$c['supplier'].($c['formulation'] ? ' • Formulation: '.$c['formulation'] : '').' • Pack Sale: '.$c['pack_sale_price'],
                        'details_ur' => 'پیک سائز: '.$c['pack_size'].' • کیٹیگری: '.$c['category'].' • برانڈ: '.$c['brand'].' • سپلائر: '.$c['supplier'].($c['formulation'] ? ' • فارمولیشن: '.$c['formulation'] : ''),
                        'edit_path' => '/products/'.$c['id'].'/edit',
                    ], $created),
                ],
            ],
            productVersion: $productVersion
        );
    }

    /**
     * Builds the mandatory user permission confirmation preview before creating product(s).
     *
     * @param  array<int, array<string, mixed>>  $rawItems
     * @return array<string, mixed>
     */
    protected function buildCreateProductsPermissionResponse(array $rawItems, string $productVersion): array
    {
        $proposedProducts = [];
        $previewLinesEn = [];
        $previewLinesUr = [];
        $previewRecords = [];

        foreach (array_slice($rawItems, 0, 25) as $idx => $item) {
            $num = $idx + 1;
            $name = trim((string) ($item['name'] ?? 'New Product'));
            $packSize = max(1, (int) ($item['pack_size'] ?? 1));
            $category = trim((string) ($item['category'] ?? ''));
            $brand = trim((string) ($item['brand'] ?? ''));
            $supplier = trim((string) ($item['supplier'] ?? ''));
            $formulation = trim((string) ($item['formulation'] ?? ''));
            $packPurchase = isset($item['pack_purchase_price']) && is_numeric($item['pack_purchase_price'])
                ? round((float) $item['pack_purchase_price'], 2)
                : (isset($item['unit_purchase_price']) && is_numeric($item['unit_purchase_price'])
                    ? round(((float) $item['unit_purchase_price']) * $packSize, 2)
                    : 0.0);
            $unitPurchase = isset($item['unit_purchase_price']) && is_numeric($item['unit_purchase_price'])
                ? round((float) $item['unit_purchase_price'], 2)
                : round($packPurchase / $packSize, 2);
            $packSale = isset($item['pack_sale_price']) && is_numeric($item['pack_sale_price'])
                ? round((float) $item['pack_sale_price'], 2)
                : (isset($item['unit_sale_price']) && is_numeric($item['unit_sale_price'])
                    ? round(((float) $item['unit_sale_price']) * $packSize, 2)
                    : 0.0);
            $unitSale = isset($item['unit_sale_price']) && is_numeric($item['unit_sale_price'])
                ? round((float) $item['unit_sale_price'], 2)
                : round($packSale / $packSize, 2);
            $margin = ($unitSale > 0 && $unitPurchase > 0)
                ? round((($unitSale - $unitPurchase) / $unitSale) * 100, 2)
                : 0.0;
            $rack = trim((string) ($item['rack'] ?? ''));

            $proposedProducts[] = [
                'name' => $name,
                'pack_size' => $packSize,
                'category' => $category,
                'brand' => $brand,
                'supplier' => $supplier,
                'formulation' => $formulation !== '' ? $formulation : null,
                'pack_purchase_price' => $packPurchase,
                'unit_purchase_price' => $unitPurchase,
                'pack_sale_price' => $packSale,
                'unit_sale_price' => $unitSale,
                'margin' => $margin,
                'rack' => $rack !== '' ? $rack : null,
            ];

            $previewRecords[] = [
                'title' => $name,
                'code_preview' => 'Auto PRD-XXXX',
                'badge_en' => 'Staged — Not Saved Yet',
                'badge_ur' => 'پری ویو (ابھی محفوظ نہیں ہوا)',
                'fields' => [
                    ['field' => 'Product Name', 'label_ur' => 'پروڈکٹ کا نام', 'before' => null, 'after' => $name],
                    ['field' => 'Pack Size', 'label_ur' => 'پیک سائز', 'before' => null, 'after' => (string) $packSize],
                    ['field' => 'Category', 'label_ur' => 'کیٹیگری', 'before' => null, 'after' => $category],
                    ['field' => 'Brand', 'label_ur' => 'برانڈ', 'before' => null, 'after' => $brand],
                    ['field' => 'Supplier', 'label_ur' => 'سپلائر', 'before' => null, 'after' => $supplier],
                    ['field' => 'Formulation', 'label_ur' => 'فارمولیشن', 'before' => null, 'after' => $formulation !== '' ? $formulation : '—'],
                    ['field' => 'Purchase Price (Pack / Unit)', 'label_ur' => 'قیمت خرید (پیک / یونٹ)', 'before' => null, 'after' => number_format($packPurchase, 2).' / '.number_format($unitPurchase, 2)],
                    ['field' => 'Sale Price (Pack / Unit)', 'label_ur' => 'قیمت فروخت (پیک / یونٹ)', 'before' => null, 'after' => number_format($packSale, 2).' / '.number_format($unitSale, 2)." (Margin: {$margin}%)"],
                    ['field' => 'Rack / Shelf', 'label_ur' => 'ریک', 'before' => null, 'after' => $rack !== '' ? $rack : 'Default'],
                ],
            ];

            $extraEn = [];
            $extraUr = [];
            if ($formulation !== '') {
                $extraEn[] = "Formulation: `{$formulation}`";
                $extraUr[] = "فارمولیشن: `{$formulation}`";
            }
            if ($packPurchase > 0) {
                $extraEn[] = "Pack Purchase: `{$packPurchase}`";
                $extraUr[] = "پیک خرید: `{$packPurchase}`";
            }
            if ($packSale > 0) {
                $extraEn[] = "Pack Sale: `{$packSale}`";
                $extraUr[] = "پیک فروخت: `{$packSale}`";
            }
            if ($rack !== '') {
                $extraEn[] = "Rack: `{$rack}`";
                $extraUr[] = "ریک: `{$rack}`";
            }

            $extraStrEn = ! empty($extraEn) ? ' • '.implode(' • ', $extraEn) : '';
            $extraStrUr = ! empty($extraUr) ? ' • '.implode(' • ', $extraUr) : '';

            $previewLinesEn[] = "{$num}. **{$name}** — Pack Size: `{$packSize}` • Category: `{$category}` • Brand: `{$brand}` • Supplier: `{$supplier}`{$extraStrEn}";
            $previewLinesUr[] = "{$num}. **{$name}** — پیک سائز: `{$packSize}` • کیٹیگری: `{$category}` • برانڈ: `{$brand}` • سپلائر: `{$supplier}`{$extraStrUr}";
        }

        $firstCollected = $proposedProducts[0] ?? [];

        $answerEn = "🔒 **User Permission Required — Review Result Before Posting to Database**\n\n"
            ."Cube AI has prepared the following **Add Product** result preview (**nothing has been posted to the database yet**):\n\n"
            .implode("\n", $previewLinesEn)."\n\n"
            ."**Do you grant permission to post this record to the database?**\n"
            ."Click **\"✅ Approve & Post to Database\"** below (or reply `yes` / `confirm` to proceed, or `cancel` to abort).";

        $answerUr = "🔒 **ڈیٹا بیس میں محفوظ کرنے سے پہلے نتیجہ چیک کریں اور اجازت (Permission) دیں**\n\n"
            ."کیوب اے آئی نے **نئی پروڈکٹ شامل کرنے** کا نتیجہ تیار کر لیا ہے (**ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا**):\n\n"
            .implode("\n", $previewLinesUr)."\n\n"
            ."**کیا آپ اس نتیجے کو ڈیٹا بیس میں پوسٹ کرنے کی اجازت دیتے ہیں؟**\n"
            ."نیچے **\"✅ اجازت دیں اور ڈیٹا بیس میں محفوظ کریں\"** بٹن پر کلک کریں (یا تصدیق کے لیے `yes` لکھیں، اور منسوخ کرنے کے لیے `cancel` لکھیں)۔";

        return $this->formatTaskResponse(
            titleEn: 'Permission Required: Confirm Adding '.count($proposedProducts).' Product(s)',
            titleUr: 'اجازت درکار ہے: '.count($proposedProducts).' نئی پروڈکٹ(س) شامل کرنے کی تصدیق کریں',
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'create_products',
                'status' => 'awaiting_permission',
                'requires_permission' => true,
                'created_count' => 0,
                'proposed_products' => $proposedProducts,
                'collected_fields' => array_filter($firstCollected, fn ($v) => $v !== null && $v !== ''),
                'preview_result' => [
                    'staged' => true,
                    'posted_to_database' => false,
                    'database_table' => 'products',
                    'operation' => 'INSERT',
                    'operation_label_en' => 'Staged Database Result Preview (Not Posted Yet)',
                    'operation_label_ur' => 'ڈیٹا بیس پری ویو (ابھی محفوظ نہیں کیا گیا)',
                    'records' => $previewRecords,
                ],
                'proposed_task' => [
                    'action' => 'create_products',
                    'label_en' => 'Create '.count($proposedProducts).' New Product(s) in Catalog',
                    'label_ur' => 'کیٹلاگ میں '.count($proposedProducts).' نئی پروڈکٹ(س) شامل کریں',
                    'summary_items_en' => $previewLinesEn,
                    'summary_items_ur' => $previewLinesUr,
                ],
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_awaiting_permission'
        );
    }

    /**
     * Presents existing matching database products when a user asks to create a product
     * so they can select or edit an existing product instead of creating duplicates.
     *
     * @param  array<string, mixed>  $draft
     * @param  array<int, array<string, mixed>>  $dbMatches
     * @return array<string, mixed>
     */
    protected function buildExistingProductMatchesStepResponse(array $draft, array $dbMatches, string $productVersion): array
    {
        $name = trim((string) ($draft['name'] ?? 'Product'));
        $missingFields = $this->getMissingCreateProductFields($draft);

        $matchLinesEn = [];
        $matchLinesUr = [];
        $stepChoices = [];

        foreach ($dbMatches as $idx => $m) {
            $num = $idx + 1;
            $matchLinesEn[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_en']}";
            $matchLinesUr[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_ur']}";

            if ($idx < 3) {
                $stepChoices[] = [
                    'label_en' => "✓ Select Existing: {$m['name']} ({$m['code']})",
                    'label_ur' => "✓ موجودہ منتخب کریں: {$m['name']}",
                    'reply' => "Select existing #{$m['id']}: {$m['name']}",
                    'variant' => 'primary',
                ];
                $stepChoices[] = [
                    'label_en' => "✏️ Edit Existing: {$m['name']}",
                    'label_ur' => "✏️ موجودہ ایڈٹ کریں: {$m['name']}",
                    'reply' => "Edit existing #{$m['id']}: {$m['name']}",
                    'variant' => 'secondary',
                ];
            }
        }

        $stepChoices[] = [
            'label_en' => "➕ Create \"{$name}\" as New Product Anyway",
            'label_ur' => "➕ \"{$name}\" نئی پروڈکٹ کے طور پر شامل کریں",
            'reply' => 'Create as new product anyway',
            'variant' => 'accent',
        ];

        $answerEn = "🔍 **Step 1 — Database Search Result for `\"{$name}\"`**\n\n"
            ."Before creating a new product, I searched your database and found **".count($dbMatches)." matching product(s)** already in your catalog:\n\n"
            .implode("\n", $matchLinesEn)."\n\n"
            ."**What would you like to do next?**\n"
            ."- Click **\"✓ Select Existing\"** or **\"✏️ Edit Existing\"** below to use a product already in your database, OR\n"
            ."- Click **\"➕ Create as New Product Anyway\"** (or reply with the remaining product details) if this is a brand-new item.";

        $answerUr = "🔍 **مرحلہ 1 — ڈیٹا بیس میں `\"{$name}\"` کی تلاش کا نتیجہ**\n\n"
            ."نئی پروڈکٹ بنانے سے پہلے ڈیٹا بیس میں تلاش کرنے پر **".count($dbMatches)." ملتی جلتی پروڈکٹ(س)** پہلے سے موجود ملیں:\n\n"
            .implode("\n", $matchLinesUr)."\n\n"
            ."**آپ کیا کرنا چاہیں گے؟**\n"
            ."- پہلے سے موجود پروڈکٹ استعمال یا ایڈٹ کرنے کے لیے نیچے بٹن پر کلک کریں، یا\n"
            ."- اگر واقعی نئی پروڈکٹ بنانی ہے تو **\"➕ نئی پروڈکٹ کے طور پر شامل کریں\"** پر کلک کریں۔";

        return $this->formatTaskResponse(
            titleEn: "🔍 Matching Product(s) Found in Database for \"{$name}\"",
            titleUr: "🔍 ڈیٹا بیس میں \"{$name}\" سے ملتی جلتی پروڈکٹ موجود ہے",
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'create_products',
                'status' => 'resolve_db_matches',
                'created_count' => 0,
                'missing_fields' => $missingFields,
                'collected_fields' => array_filter(['name' => $name]),
                'step_info' => [
                    'current' => 1,
                    'total' => 3,
                    'label_en' => 'Step 1 of 3: Check Existing Database Matches First',
                    'label_ur' => 'مرحلہ 1 از 3: پہلے ڈیٹا بیس میں موجود پروڈکٹس چیک کریں',
                ],
                'db_matches' => $dbMatches,
                'step_choices' => $stepChoices,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_needs_input'
        );
    }

    /**
     * Builds an interactive step-by-step follow-up response asking the user for the required fields
     * needed to complete adding the product(s), without assuming any values and without creating
     * new Brands or Suppliers.
     *
     * @param  array<int, array<string, mixed>>  $draftItems
     * @return array<string, mixed>
     */
    protected function buildMissingCreateProductFieldsResponse(array $draftItems, string $productVersion): array
    {
        $firstDraft = is_array($draftItems[0] ?? null) ? $draftItems[0] : [];
        $missingFields = $this->getMissingCreateProductFields($firstDraft);
        $invalidBrand = isset($firstDraft['_invalid_brand']) ? trim((string) $firstDraft['_invalid_brand']) : '';
        $invalidSupplier = isset($firstDraft['_invalid_supplier']) ? trim((string) $firstDraft['_invalid_supplier']) : '';

        $collectedEn = [];
        $collectedUr = [];
        $fieldLabels = [
            'name' => ['en' => 'Product Name', 'ur' => 'پروڈکٹ کا نام'],
            'pack_size' => ['en' => 'Pack Size', 'ur' => 'پیک سائز'],
            'category' => ['en' => 'Category', 'ur' => 'کیٹیگری'],
            'brand' => ['en' => 'Brand', 'ur' => 'برانڈ'],
            'supplier' => ['en' => 'Supplier', 'ur' => 'سپلائر'],
            'formulation' => ['en' => 'Formulation', 'ur' => 'فارمولیشن'],
            'pack_purchase_price' => ['en' => 'Pack Purchase Price', 'ur' => 'پیک قیمت خرید'],
            'pack_sale_price' => ['en' => 'Pack Sale Price', 'ur' => 'پیک قیمت فروخت'],
            'unit_purchase_price' => ['en' => 'Unit Purchase Price', 'ur' => 'یونٹ قیمت خرید'],
            'unit_sale_price' => ['en' => 'Unit Sale Price', 'ur' => 'یونٹ قیمت فروخت'],
            'rack' => ['en' => 'Rack', 'ur' => 'ریک'],
        ];

        $collectedSummary = [];
        foreach ($fieldLabels as $key => $labels) {
            $val = $firstDraft[$key] ?? null;
            if ($val !== null && trim((string) $val) !== '') {
                $collectedSummary[$key] = $val;
                $collectedEn[] = "- **{$labels['en']}:** `{$val}`";
                $collectedUr[] = "- **{$labels['ur']}:** `{$val}`";
            }
        }

        // Fetch existing catalog items so the user can choose an existing Category, Brand & Supplier
        $existingCategories = Schema::hasTable('categories')
            ? Category::query()->orderBy('name')->limit(6)->pluck('name')->all()
            : [];
        $existingBrands = Schema::hasTable('brands')
            ? Brand::query()->orderBy('name')->limit(8)->pluck('name')->all()
            : [];
        $existingSuppliers = Schema::hasTable('suppliers')
            ? Supplier::query()->orderBy('name')->limit(8)->pluck('name')->all()
            : [];

        // Determine current logical step for step-by-step guidance
        $stepChoices = [];
        if (in_array('name', $missingFields, true)) {
            $stepInfo = [
                'current' => 1,
                'total' => 3,
                'label_en' => 'Step 1 of 3: Enter Product Name (Cube Searches DB First)',
                'label_ur' => 'مرحلہ 1 از 3: پروڈکٹ کا نام لکھیں (پہلے ڈیٹا بیس میں تلاش کیا جائے گا)',
            ];
        } elseif (in_array('pack_size', $missingFields, true)) {
            $stepInfo = [
                'current' => 2,
                'total' => 3,
                'label_en' => 'Step 2 of 3: Enter Pack Size & Prices',
                'label_ur' => 'مرحلہ 2 از 3: پیک سائز اور قیمتیں درج کریں',
            ];
            foreach ([10, 14, 20, 30, 100, 200] as $ps) {
                $stepChoices[] = [
                    'label_en' => "Pack Size: {$ps}",
                    'label_ur' => "پیک سائز: {$ps}",
                    'reply' => "pack size {$ps}",
                ];
            }
        } else {
            $stepInfo = [
                'current' => 3,
                'total' => 3,
                'label_en' => 'Step 3 of 3: Select Existing Category, Brand & Supplier from DB',
                'label_ur' => 'مرحلہ 3 از 3: ڈیٹا بیس سے موجودہ کیٹیگری، برانڈ اور سپلائر منتخب کریں',
            ];
            $nextMissing = $missingFields[0] ?? '';
            if ($nextMissing === 'category') {
                foreach (array_slice($existingCategories, 0, 5) as $catName) {
                    $stepChoices[] = [
                        'label_en' => "Category: {$catName}",
                        'label_ur' => "کیٹیگری: {$catName}",
                        'reply' => "category {$catName}",
                    ];
                }
            } elseif ($nextMissing === 'brand') {
                foreach (array_slice($existingBrands, 0, 5) as $brName) {
                    $stepChoices[] = [
                        'label_en' => "Brand: {$brName}",
                        'label_ur' => "برانڈ: {$brName}",
                        'reply' => "brand {$brName}",
                    ];
                }
            } elseif ($nextMissing === 'supplier') {
                foreach (array_slice($existingSuppliers, 0, 5) as $supName) {
                    $stepChoices[] = [
                        'label_en' => "Supplier: {$supName}",
                        'label_ur' => "سپلائر: {$supName}",
                        'reply' => "supplier {$supName}",
                    ];
                }
            }
        }

        $questionsEn = [];
        $questionsUr = [];
        $exampleParts = [];

        foreach ($missingFields as $idx => $fieldKey) {
            $num = $idx + 1;
            $meta = self::REQUIRED_CREATE_PRODUCT_FIELDS[$fieldKey] ?? [
                'en' => ucfirst($fieldKey),
                'ur' => $fieldKey,
                'hint_en' => '',
                'hint_ur' => '',
            ];

            $catalogHintEn = '';
            $catalogHintUr = '';
            if ($fieldKey === 'category' && ! empty($existingCategories)) {
                $list = implode(', ', array_map(fn ($c) => "`{$c}`", $existingCategories));
                $catalogHintEn = " — Existing in catalog: {$list}";
                $catalogHintUr = " — موجودہ کیٹیگریز: {$list}";
            } elseif ($fieldKey === 'brand') {
                if (! empty($existingBrands)) {
                    $list = implode(', ', array_map(fn ($b) => "`{$b}`", $existingBrands));
                    $catalogHintEn = " — Choose an existing Brand from your catalog: {$list}";
                    $catalogHintUr = " — موجودہ برانڈز میں سے منتخب کریں: {$list}";
                } else {
                    $catalogHintEn = ' — ⚠️ No brands exist in your catalog yet. Please add a brand in **Brands** (`/brands`) first.';
                    $catalogHintUr = ' — ⚠️ ابھی کوئی برانڈ موجود نہیں ہے۔ پہلے **Brands** پیج پر برانڈ شامل کریں۔';
                }
            } elseif ($fieldKey === 'supplier') {
                if (! empty($existingSuppliers)) {
                    $list = implode(', ', array_map(fn ($s) => "`{$s}`", $existingSuppliers));
                    $catalogHintEn = " — Choose an existing Supplier from your catalog: {$list}";
                    $catalogHintUr = " — موجودہ سپلائرز میں سے منتخب کریں: {$list}";
                } else {
                    $catalogHintEn = ' — ⚠️ No suppliers exist in your catalog yet. Please add a supplier in **Suppliers** (`/suppliers`) first.';
                    $catalogHintUr = ' — ⚠️ ابھی کوئی سپلائر موجود نہیں ہے۔ پہلے **Suppliers** پیج پر سپلائر شامل کریں۔';
                }
            }

            $questionsEn[] = "{$num}. **{$meta['en']}** — {$meta['hint_en']}{$catalogHintEn}";
            $questionsUr[] = "{$num}. **{$meta['ur']}** — {$meta['hint_ur']}{$catalogHintUr}";

            $exampleParts[] = match ($fieldKey) {
                'name' => 'name Panadol 500mg Tablet',
                'pack_size' => 'pack size 200',
                'category' => 'category '.($existingCategories[0] ?? 'Tablets'),
                'brand' => 'brand '.($existingBrands[0] ?? 'GSK'),
                'supplier' => 'supplier '.($existingSuppliers[0] ?? 'Ali Gohar'),
                default => "{$fieldKey} value",
            };
        }

        $productHeadingEn = ! empty($firstDraft['name']) ? "**{$firstDraft['name']}**" : 'this new product';
        $productHeadingUr = ! empty($firstDraft['name']) ? "**{$firstDraft['name']}**" : 'نئی پروڈکٹ';

        $linesEn = [];
        $linesUr = [];

        if ($invalidBrand !== '' || $invalidSupplier !== '') {
            if ($invalidBrand !== '') {
                $brandListText = ! empty($existingBrands)
                    ? implode(', ', array_map(fn ($b) => "`{$b}`", $existingBrands))
                    : '*(no brands in catalog yet — please create one in `/brands` first)*';
                $linesEn[] = "⚠️ **Brand Not Found (`{$invalidBrand}`):** Cube **never creates a new Brand** when adding a product. Please choose an **existing Brand** from your database: {$brandListText}";
                $linesUr[] = "⚠️ **برانڈ موجود نہیں ہے (`{$invalidBrand}`):** کیوب پروڈکٹ شامل کرتے وقت **نیا برانڈ خود نہیں بناتا**۔ براہِ کرم پہلے سے موجود برانڈ منتخب کریں: {$brandListText}";
            }
            if ($invalidSupplier !== '') {
                $supplierListText = ! empty($existingSuppliers)
                    ? implode(', ', array_map(fn ($s) => "`{$s}`", $existingSuppliers))
                    : '*(no suppliers in catalog yet — please create one in `/suppliers` first)*';
                $linesEn[] = "⚠️ **Supplier Not Found (`{$invalidSupplier}`):** Cube **never creates a new Supplier** when adding a product. Please choose an **existing Supplier** from your database: {$supplierListText}";
                $linesUr[] = "⚠️ **سپلائر موجود نہیں ہے (`{$invalidSupplier}`):** کیوب پروڈکٹ شامل کرتے وقت **نیا سپلائر خود نہیں بناتا**۔ براہِ کرم پہلے سے موجود سپلائر منتخب کریں: {$supplierListText}";
            }
        } elseif (in_array('name', $missingFields, true)) {
            $linesEn[] = "🪜 **{$stepInfo['label_en']}**\nFirst, please tell me the **Product / Medicine Name** you want to add. I will search your database first to check if a matching product already exists before asking for the next details.";
            $linesUr[] = "🪜 **{$stepInfo['label_ur']}**\nسب سے پہلے **پروڈکٹ کا نام** بتائیں۔ میں پہلے ڈیٹا بیس میں چیک کروں گا کہ یہ پروڈکٹ پہلے سے موجود ہے یا نہیں۔";
        } else {
            $linesEn[] = "🪜 **{$stepInfo['label_en']}**\n✅ Checked database: No duplicate product matched {$productHeadingEn}. Please provide the next required details (**Cube never assumes missing fields** and **only uses existing Brands & Suppliers**):";
            $linesUr[] = "🪜 **{$stepInfo['label_ur']}**\n✅ ڈیٹا بیس چیک کر لیا گیا۔ براہِ کرم {$productHeadingUr} مکمّل کرنے کے لیے درج ذیل معلومات بتائیں:";
        }

        if (! empty($collectedEn)) {
            $linesEn[] = "✅ **Details Already Recorded:**\n".implode("\n", $collectedEn);
            $linesUr[] = "✅ **موصول شدہ معلومات:**\n".implode("\n", $collectedUr);
        }

        $linesEn[] = "❓ **Required Details Needed to Complete the Task:**\n".implode("\n", $questionsEn);
        $linesUr[] = "❓ **مطلوبہ معلومات (براہِ کرم جواب میں لکھیں):**\n".implode("\n", $questionsUr);

        $linesEn[] = "*(Optional: You can also include `formulation`, `pack purchase price`, `pack sale price`, or `rack`.)*\n\n"
            ."**Reply example:**\n`".implode(', ', $exampleParts)."`\n*(Or type `cancel` to abort this task.)*";
        $linesUr[] = "*(اختیاری: آپ ساتھ میں `formulation`، `pack purchase price`، `pack sale price` یا `rack` بھی لکھ سکتے ہیں۔)*\n\n"
            ."**جواب لکھنے کی مثال:**\n`".implode(', ', $exampleParts)."`\n*(یا منسوخ کرنے کے لیے `cancel` لکھیں۔)*";

        $links = [
            ['path' => '/products/create', 'en' => 'Open Add Product Form', 'ur' => 'پروڈکٹ فارم کھولیں'],
        ];
        if (in_array('brand', $missingFields, true)) {
            $links[] = ['path' => '/brands', 'en' => 'Manage Brands', 'ur' => 'برانڈز دیکھیں'];
        }
        if (in_array('supplier', $missingFields, true)) {
            $links[] = ['path' => '/suppliers', 'en' => 'Manage Suppliers', 'ur' => 'سپلائرز دیکھیں'];
        }

        return $this->formatTaskResponse(
            titleEn: ($invalidBrand !== '' || $invalidSupplier !== '')
                ? 'Existing Brand & Supplier Required (No New Brand/Supplier Created)'
                : 'Required Product Details Needed (No Assumptions)',
            titleUr: ($invalidBrand !== '' || $invalidSupplier !== '')
                ? 'صرف پہلے سے موجود برانڈ اور سپلائر منتخب کریں'
                : 'پروڈکٹ شامل کرنے کے لیے مطلوبہ معلومات درکار ہیں',
            answerEn: implode("\n\n", $linesEn),
            answerUr: implode("\n\n", $linesUr),
            links: $links,
            taskMeta: [
                'action' => 'create_products',
                'status' => 'needs_required_fields',
                'created_count' => 0,
                'missing_fields' => $missingFields,
                'collected_fields' => $collectedSummary,
                'invalid_brand' => $invalidBrand !== '' ? $invalidBrand : null,
                'invalid_supplier' => $invalidSupplier !== '' ? $invalidSupplier : null,
                'step_info' => $stepInfo,
                'step_choices' => $stepChoices,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_needs_input'
        );
    }

    /**
     * Executes non-destructive updates on 1 or multiple existing products.
     * Never assumes which product or which field to edit; asks the user if either is missing.
     * Never creates a new Brand or Supplier — only assigns existing ones.
     *
     * @param  array<string, mixed>  $taskData
     * @return array<string, mixed>
     */
    protected function executeUpdateProducts(User $user, array $taskData, string $productVersion): array
    {
        if (! $this->canUpdateProducts($user)) {
            return $this->buildPermissionDeniedResponse('product.update', $productVersion);
        }

        $updates = is_array($taskData['updates'] ?? null) ? array_values(array_filter($taskData['updates'], 'is_array')) : [];
        if (empty($updates)) {
            $emptyUpdate = [['target_name_or_code' => null]];
            $this->savePendingTask($user, [
                'action' => 'update_products',
                'updates' => $emptyUpdate,
            ]);

            return $this->buildMissingUpdateProductFieldsResponse($emptyUpdate[0], $productVersion);
        }

        $editableKeys = [
            'new_name', 'formulation', 'pack_size',
            'pack_purchase_price', 'pack_sale_price', 'unit_purchase_price', 'unit_sale_price',
            'whole_sale_pack_price', 'whole_sale_unit_price',
            'category', 'brand', 'supplier', 'rack', 'narcotic',
            'max_discount', 'expiry_warning_days', 'description',
        ];

        foreach ($updates as $uItem) {
            $target = trim((string) ($uItem['target_name_or_code'] ?? ($uItem['name'] ?? '')));
            $hasFieldToChange = false;
            foreach ($editableKeys as $ek) {
                if (isset($uItem[$ek]) && $uItem[$ek] !== null && trim((string) $uItem[$ek]) !== '') {
                    $hasFieldToChange = true;
                    break;
                }
            }

            if ($target === '' || ! $hasFieldToChange) {
                $this->savePendingTask($user, [
                    'action' => 'update_products',
                    'status' => 'needs_required_fields',
                    'updates' => $updates,
                ]);

                return $this->buildMissingUpdateProductFieldsResponse($uItem, $productVersion);
            }
        }

        // Always ask for explicit user permission before executing product updates
        $userConfirmed = (bool) ($taskData['user_confirmed'] ?? false);
        if (! $userConfirmed) {
            $this->savePendingTask($user, [
                'action' => 'update_products',
                'status' => 'awaiting_permission',
                'awaiting_permission' => true,
                'updates' => $updates,
            ]);

            return $this->buildUpdateProductsPermissionResponse($updates, $productVersion);
        }

        $this->clearPendingTask($user);

        $updatedRecords = [];
        $notFoundTargets = [];
        $catalogWarningsEn = [];
        $catalogWarningsUr = [];

        foreach (array_slice($updates, 0, 25) as $item) {
            $target = trim((string) ($item['target_name_or_code'] ?? ($item['name'] ?? '')));
            if ($target === '') {
                continue;
            }

            $product = $this->findProductByNameOrCode($target);
            if (! $product) {
                $notFoundTargets[] = $target;
                continue;
            }

            $changes = [];

            if (! empty($item['new_name'])) {
                $newName = trim((string) $item['new_name']);
                $conflict = Product::whereRaw('LOWER(name) = ?', [mb_strtolower($newName, 'UTF-8')])
                    ->where('id', '!=', $product->id)
                    ->exists();
                if ($newName !== '' && ! $conflict) {
                    $product->name = $newName;
                    $changes[] = "Name → **{$newName}**";
                }
            }

            if (isset($item['formulation']) && trim((string) $item['formulation']) !== '') {
                $resolvedF = Formulation::resolveOrCreate((string) $item['formulation']);
                $product->formulation = $resolvedF?->name ?? trim((string) $item['formulation']);
                $changes[] = "Formulation → **{$product->formulation}**";
            }

            if (isset($item['pack_size']) && is_numeric($item['pack_size']) && (int) $item['pack_size'] >= 1) {
                $product->pack_size = (int) $item['pack_size'];
                $changes[] = "Pack Size → `{$product->pack_size}`";
            }

            $packSize = max(1, (int) ($product->pack_size ?: 1));

            if (isset($item['pack_purchase_price']) && is_numeric($item['pack_purchase_price'])) {
                $product->pack_purchase_price = round((float) $item['pack_purchase_price'], 2);
                if (! isset($item['unit_purchase_price']) || ! is_numeric($item['unit_purchase_price'])) {
                    $product->unit_purchase_price = round($product->pack_purchase_price / $packSize, 2);
                }
                $changes[] = "Pack Purchase Price → `{$product->pack_purchase_price}`";
            }

            if (isset($item['unit_purchase_price']) && is_numeric($item['unit_purchase_price'])) {
                $product->unit_purchase_price = round((float) $item['unit_purchase_price'], 2);
                if (! isset($item['pack_purchase_price']) || ! is_numeric($item['pack_purchase_price'])) {
                    $product->pack_purchase_price = round($product->unit_purchase_price * $packSize, 2);
                }
                $changes[] = "Unit Purchase Price → `{$product->unit_purchase_price}`";
            }

            if (isset($item['pack_sale_price']) && is_numeric($item['pack_sale_price'])) {
                $product->pack_sale_price = round((float) $item['pack_sale_price'], 2);
                if (! isset($item['unit_sale_price']) || ! is_numeric($item['unit_sale_price'])) {
                    $product->unit_sale_price = round($product->pack_sale_price / $packSize, 2);
                }
                $changes[] = "Pack Sale Price → `{$product->pack_sale_price}`";
            }

            if (isset($item['unit_sale_price']) && is_numeric($item['unit_sale_price'])) {
                $product->unit_sale_price = round((float) $item['unit_sale_price'], 2);
                if (! isset($item['pack_sale_price']) || ! is_numeric($item['pack_sale_price'])) {
                    $product->pack_sale_price = round($product->unit_sale_price * $packSize, 2);
                }
                $changes[] = "Unit Sale Price → `{$product->unit_sale_price}`";
            }

            if (isset($item['whole_sale_pack_price']) && is_numeric($item['whole_sale_pack_price'])) {
                $product->whole_sale_pack_price = round((float) $item['whole_sale_pack_price'], 2);
                $changes[] = "Wholesale Pack Price → `{$product->whole_sale_pack_price}`";
            }

            if (isset($item['whole_sale_unit_price']) && is_numeric($item['whole_sale_unit_price'])) {
                $product->whole_sale_unit_price = round((float) $item['whole_sale_unit_price'], 2);
                $changes[] = "Wholesale Unit Price → `{$product->whole_sale_unit_price}`";
            }

            if (! empty($item['category'])) {
                $cat = $this->resolveOrCreateCategory((string) $item['category']);
                $product->category_id = $cat->id;
                $changes[] = "Category → **{$cat->name}**";
            }

            if (! empty($item['brand'])) {
                $br = $this->findExistingBrand((string) $item['brand']);
                if ($br) {
                    $product->brand_id = $br->id;
                    $changes[] = "Brand → **{$br->name}**";
                } else {
                    $catalogWarningsEn[] = "⚠️ Brand **`{$item['brand']}`** does not exist in your catalog (Cube never creates new brands).";
                    $catalogWarningsUr[] = "⚠️ برانڈ **`{$item['brand']}`** کیٹلاگ میں موجود نہیں ہے (کیوب نیا برانڈ نہیں بناتا)۔";
                }
            }

            if (! empty($item['supplier'])) {
                $sup = $this->findExistingSupplier((string) $item['supplier']);
                if ($sup) {
                    $product->supplier_id = $sup->id;
                    $changes[] = "Supplier → **{$sup->name}**";
                } else {
                    $catalogWarningsEn[] = "⚠️ Supplier **`{$item['supplier']}`** does not exist in your catalog (Cube never creates new suppliers).";
                    $catalogWarningsUr[] = "⚠️ سپلائر **`{$item['supplier']}`** کیٹلاگ میں موجود نہیں ہے (کیوب نیا سپلائر نہیں بناتا)۔";
                }
            }

            if (isset($item['rack']) && trim((string) $item['rack']) !== '') {
                $product->rack = trim((string) $item['rack']);
                $changes[] = "Rack → `{$product->rack}`";
            }

            if (isset($item['max_discount']) && is_numeric($item['max_discount'])) {
                $product->max_discount = max(0, (int) $item['max_discount']);
                $changes[] = "Max Discount → `{$product->max_discount}%`";
            }

            if (isset($item['expiry_warning_days']) && is_numeric($item['expiry_warning_days'])) {
                $product->expiry_warning_days = max(1, min(3650, (int) $item['expiry_warning_days']));
                $changes[] = "Expiry Warning → `{$product->expiry_warning_days} days`";
            }

            if (isset($item['narcotic']) && in_array($item['narcotic'], ['yes', 'no'], true)) {
                $product->narcotic = $item['narcotic'];
                $changes[] = "Narcotic → `{$product->narcotic}`";
            }

            if (isset($item['description']) && trim((string) $item['description']) !== '') {
                $product->description = trim((string) $item['description']);
                $changes[] = 'Description updated';
            }

            if (! empty($changes)) {
                $product->save();
                $updatedRecords[] = [
                    'id' => $product->id,
                    'product_code' => $product->product_code,
                    'name' => $product->name,
                    'changes' => $changes,
                ];
            }
        }

        $linesEn = [];
        $linesUr = [];

        if (! empty($updatedRecords)) {
            $linesEn[] = '✅ **Cube AI Task Completed — Updated '.count($updatedRecords).' Product(s):**';
            $linesUr[] = '✅ **کیوب اے آئی نے '.count($updatedRecords).' پروڈکٹ(س) کامیابی سے اپڈیٹ کر دیں:**';

            foreach ($updatedRecords as $idx => $rec) {
                $num = $idx + 1;
                $changeStr = implode(' • ', $rec['changes']);
                $linesEn[] = "{$num}. **{$rec['name']}** (`{$rec['product_code']}`): {$changeStr}";
                $linesUr[] = "{$num}. **{$rec['name']}** (`{$rec['product_code']}`): {$changeStr}";
            }
        }

        if (! empty($catalogWarningsEn)) {
            $linesEn[] = implode("\n", array_unique($catalogWarningsEn));
            $linesUr[] = implode("\n", array_unique($catalogWarningsUr));
        }

        if (! empty($notFoundTargets)) {
            $missingStr = implode(', ', array_map(fn ($t) => "**{$t}**", $notFoundTargets));
            $linesEn[] = "⚠️ Could not find product(s) matching: {$missingStr}";
            $linesUr[] = "⚠️ یہ پروڈکٹ کیٹلاگ میں نہیں ملی: {$missingStr}";
        }

        $links = [
            ['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں'],
        ];
        if (count($updatedRecords) === 1) {
            $links[] = [
                'path' => '/products/'.$updatedRecords[0]['id'].'/edit',
                'en' => 'Inspect '.$updatedRecords[0]['name'],
                'ur' => $updatedRecords[0]['name'].' دیکھیں',
            ];
        }

        return $this->formatTaskResponse(
            titleEn: ! empty($updatedRecords)
                ? 'Updated '.count($updatedRecords).' Product(s)'
                : 'No Matching Product Updated',
            titleUr: ! empty($updatedRecords)
                ? count($updatedRecords).' پروڈکٹ(س) اپڈیٹ کر دی گئیں'
                : 'مطلوبہ پروڈکٹ نہیں ملی',
            answerEn: implode("\n\n", $linesEn) ?: 'No changes were applied.',
            answerUr: implode("\n\n", $linesUr) ?: 'کوئی تبدیلی نہیں کی گئی۔',
            links: $links,
            taskMeta: [
                'action' => 'update_products',
                'status' => 'completed',
                'permission_granted' => true,
                'updated_count' => count($updatedRecords),
                'updated_products' => $updatedRecords,
                'not_found' => $notFoundTargets,
                'refresh_products' => ! empty($updatedRecords),
                'result_summary' => [
                    'action_label' => [
                        'en' => 'Updated '.count($updatedRecords).' Product(s)',
                        'ur' => count($updatedRecords).' پروڈکٹ(س) اپڈیٹ کی گئیں',
                    ],
                    'affected_count' => count($updatedRecords),
                    'items' => array_map(fn (array $rec): array => [
                        'id' => $rec['id'],
                        'code' => $rec['product_code'],
                        'name' => $rec['name'],
                        'details_en' => implode(' • ', $rec['changes']),
                        'details_ur' => implode(' • ', $rec['changes']),
                        'edit_path' => '/products/'.$rec['id'].'/edit',
                    ], $updatedRecords),
                ],
            ],
            productVersion: $productVersion
        );
    }

    /**
     * Builds the mandatory user permission confirmation preview before updating product(s).
     *
     * @param  array<int, array<string, mixed>>  $updates
     * @return array<string, mixed>
     */
    protected function buildUpdateProductsPermissionResponse(array $updates, string $productVersion): array
    {
        $proposedUpdates = [];
        $previewLinesEn = [];
        $previewLinesUr = [];
        $previewRecords = [];

        $fieldLabels = [
            'new_name' => 'New Name',
            'formulation' => 'Formulation',
            'pack_size' => 'Pack Size',
            'pack_purchase_price' => 'Pack Purchase Price',
            'pack_sale_price' => 'Pack Sale Price',
            'unit_purchase_price' => 'Unit Purchase Price',
            'unit_sale_price' => 'Unit Sale Price',
            'whole_sale_pack_price' => 'Wholesale Pack Price',
            'whole_sale_unit_price' => 'Wholesale Unit Price',
            'category' => 'Category',
            'brand' => 'Brand',
            'supplier' => 'Supplier',
            'rack' => 'Rack',
            'narcotic' => 'Narcotic',
            'max_discount' => 'Max Discount (%)',
            'expiry_warning_days' => 'Expiry Warning Days',
            'description' => 'Description',
        ];

        $fieldLabelsUr = [
            'new_name' => 'نیا نام',
            'formulation' => 'فارمولیشن',
            'pack_size' => 'پیک سائز',
            'pack_purchase_price' => 'پیک قیمت خرید',
            'pack_sale_price' => 'پیک قیمت فروخت',
            'unit_purchase_price' => 'یونٹ قیمت خرید',
            'unit_sale_price' => 'یونٹ قیمت فروخت',
            'whole_sale_pack_price' => 'ہول سیل پیک قیمت',
            'whole_sale_unit_price' => 'ہول سیل یونٹ قیمت',
            'category' => 'کیٹیگری',
            'brand' => 'برانڈ',
            'supplier' => 'سپلائر',
            'rack' => 'ریک',
            'narcotic' => 'نارکوٹک',
            'max_discount' => 'زیادہ سے زیادہ ڈسکاؤنٹ (%)',
            'expiry_warning_days' => 'ایکسپائری وارننگ دن',
            'description' => 'تفصیل',
        ];

        foreach (array_slice($updates, 0, 25) as $idx => $item) {
            $num = $idx + 1;
            $target = trim((string) ($item['target_name_or_code'] ?? ($item['name'] ?? 'Product')));
            $matchedProduct = $this->findProductByNameOrCode($target);
            $displayTarget = $matchedProduct
                ? "**{$matchedProduct->name}** (`{$matchedProduct->product_code}`)"
                : "**{$target}**";

            $changesList = [];
            $changesMap = [];
            $recordFields = [];

            $currentPackSize = max(1, (int) ($item['pack_size'] ?? ($matchedProduct?->pack_size ?: 1)));

            foreach ($fieldLabels as $key => $label) {
                if (isset($item[$key]) && $item[$key] !== null && trim((string) $item[$key]) !== '') {
                    $val = trim((string) $item[$key]);
                    $changesMap[$key] = $val;
                    $beforeVal = '—';
                    if ($matchedProduct) {
                        $beforeVal = match ($key) {
                            'new_name' => (string) $matchedProduct->name,
                            'category' => (string) (optional($matchedProduct->category)->name ?? $matchedProduct->category_id ?? '—'),
                            'brand' => (string) (optional($matchedProduct->brand)->name ?? $matchedProduct->brand_id ?? '—'),
                            'supplier' => (string) (optional($matchedProduct->supplier)->name ?? $matchedProduct->supplier_id ?? '—'),
                            default => (string) ($matchedProduct->{$key} ?? '—'),
                        };
                    }
                    $changesList[] = "{$label}: `{$beforeVal}` → `{$val}`";
                    $recordFields[] = [
                        'field' => $label,
                        'label_ur' => $fieldLabelsUr[$key] ?? $label,
                        'before' => $beforeVal !== '' ? $beforeVal : '—',
                        'after' => $val,
                    ];

                    if ($key === 'pack_sale_price' && is_numeric($val) && ! isset($item['unit_sale_price'])) {
                        $recalcUnit = round(((float) $val) / $currentPackSize, 2);
                        $recordFields[] = [
                            'field' => 'Unit Sale Price (Auto)',
                            'label_ur' => 'یونٹ قیمت فروخت (خودکار)',
                            'before' => $matchedProduct ? (string) $matchedProduct->unit_sale_price : '—',
                            'after' => (string) $recalcUnit,
                        ];
                    }
                    if ($key === 'pack_purchase_price' && is_numeric($val) && ! isset($item['unit_purchase_price'])) {
                        $recalcUnitCost = round(((float) $val) / $currentPackSize, 2);
                        $recordFields[] = [
                            'field' => 'Unit Purchase Price (Auto)',
                            'label_ur' => 'یونٹ قیمت خرید (خودکار)',
                            'before' => $matchedProduct ? (string) $matchedProduct->unit_purchase_price : '—',
                            'after' => (string) $recalcUnitCost,
                        ];
                    }
                }
            }

            $proposedUpdates[] = [
                'target_name_or_code' => $target,
                'matched_product_id' => $matchedProduct?->id,
                'matched_product_code' => $matchedProduct?->product_code,
                'matched_product_name' => $matchedProduct?->name,
                'changes' => $changesMap,
            ];

            $previewRecords[] = [
                'title' => $matchedProduct ? $matchedProduct->name : $target,
                'code_preview' => $matchedProduct ? $matchedProduct->product_code : 'Lookup on Post',
                'badge_en' => $matchedProduct ? 'Matched in DB — Staged UPDATE' : 'Target Not Found in DB',
                'badge_ur' => $matchedProduct ? 'ڈیٹا بیس میں موجود — پری ویو' : 'پروڈکٹ نہیں ملی',
                'fields' => $recordFields,
            ];

            $changeText = ! empty($changesList) ? implode(' • ', $changesList) : 'Update requested fields';
            $previewLinesEn[] = "{$num}. {$displayTarget}: {$changeText}";
            $previewLinesUr[] = "{$num}. {$displayTarget}: {$changeText}";
        }

        $answerEn = "🔒 **User Permission Required — Review Result Before Posting to Database**\n\n"
            ."Cube AI has prepared the following **Edit Product** result preview (**nothing has been posted to the database yet**):\n\n"
            .implode("\n", $previewLinesEn)."\n\n"
            ."**Do you grant permission to post these changes to the database?**\n"
            ."Click **\"✅ Approve & Post to Database\"** below (or reply `yes` / `confirm` to proceed, or `cancel` to abort).";

        $answerUr = "🔒 **ڈیٹا بیس میں محفوظ کرنے سے پہلے نتیجہ چیک کریں اور اجازت (Permission) دیں**\n\n"
            ."کیوب اے آئی نے **پروڈکٹ اپڈیٹ کرنے** کا متوقع نتیجہ تیار کر لیا ہے (**ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا**):\n\n"
            .implode("\n", $previewLinesUr)."\n\n"
            ."**کیا آپ یہ تبدیلیاں ڈیٹا بیس میں پوسٹ کرنے کی اجازت دیتے ہیں؟**\n"
            ."نیچے **\"✅ اجازت دیں اور ڈیٹا بیس میں محفوظ کریں\"** بٹن پر کلک کریں (یا تصدیق کے لیے `yes` لکھیں، اور منسوخ کرنے کے لیے `cancel` لکھیں)۔";

        return $this->formatTaskResponse(
            titleEn: 'Permission Required: Confirm Updating '.count($proposedUpdates).' Product(s)',
            titleUr: 'اجازت درکار ہے: '.count($proposedUpdates).' پروڈکٹ(س) اپڈیٹ کرنے کی تصدیق کریں',
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'update_products',
                'status' => 'awaiting_permission',
                'requires_permission' => true,
                'updated_count' => 0,
                'proposed_updates' => $proposedUpdates,
                'preview_result' => [
                    'staged' => true,
                    'posted_to_database' => false,
                    'database_table' => 'products',
                    'operation' => 'UPDATE',
                    'operation_label_en' => 'Staged Database Result Preview (Before → After)',
                    'operation_label_ur' => 'ڈیٹا بیس تبدیلی کا پری ویو (پہلے ← بعد میں)',
                    'records' => $previewRecords,
                ],
                'proposed_task' => [
                    'action' => 'update_products',
                    'label_en' => 'Update '.count($proposedUpdates).' Existing Product(s)',
                    'label_ur' => count($proposedUpdates).' پروڈکٹ(س) میں تبدیلی محفوظ کریں',
                    'summary_items_en' => $previewLinesEn,
                    'summary_items_ur' => $previewLinesUr,
                ],
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_awaiting_permission'
        );
    }

    /**
     * Builds a follow-up question when the user asks to edit a product without specifying
     * which product or which field/value to change.
     *
     * @param  array<string, mixed>  $updateDraft
     * @return array<string, mixed>
     */
    protected function buildMissingUpdateProductFieldsResponse(array $updateDraft, string $productVersion): array
    {
        $target = trim((string) ($updateDraft['target_name_or_code'] ?? ($updateDraft['name'] ?? '')));
        $missingFields = [];
        if ($target === '') {
            $missingFields[] = 'target_name_or_code';
        }
        $missingFields[] = 'fields_to_update';

        $dbMatches = $target !== '' ? $this->searchMatchingProductsInDb($target, 6) : [];
        $stepChoices = [];

        if ($target !== '') {
            if (count($dbMatches) > 1 && mb_strtolower((string) ($dbMatches[0]['name'] ?? ''), 'UTF-8') !== mb_strtolower($target, 'UTF-8')) {
                $matchLinesEn = [];
                $matchLinesUr = [];
                foreach ($dbMatches as $idx => $m) {
                    $num = $idx + 1;
                    $matchLinesEn[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_en']}";
                    $matchLinesUr[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_ur']}";
                    if ($idx < 4) {
                        $stepChoices[] = [
                            'label_en' => "✓ Select: {$m['name']} ({$m['code']})",
                            'label_ur' => "✓ منتخب کریں: {$m['name']}",
                            'reply' => $m['select_reply'],
                            'variant' => 'primary',
                        ];
                    }
                }

                $answerEn = "🔍 **Step 1 of 2 — Multiple Matching Products Found in Database for `\"{$target}\"`**\n\n"
                    ."I found **".count($dbMatches)." matching products** in your database:\n\n"
                    .implode("\n", $matchLinesEn)."\n\n"
                    ."Please click/select which product you want to update, or reply with the field(s) and new value(s) to change.";
                $answerUr = "🔍 **مرحلہ 1 از 2 — ڈیٹا بیس میں `\"{$target}\"` سے ملتی جلتی متعدد پروڈکٹس ملیں**\n\n"
                    .implode("\n", $matchLinesUr)."\n\n"
                    ."براہِ کرم مطلوبہ پروڈکٹ منتخب کریں۔";
                $stepInfo = [
                    'current' => 1,
                    'total' => 2,
                    'label_en' => 'Step 1 of 2: Select Matching Product from Database',
                    'label_ur' => 'مرحلہ 1 از 2: ڈیٹا بیس سے مطلوبہ پروڈکٹ منتخب کریں',
                ];
            } else {
                $answerEn = "🪜 **Step 2 of 2 — Specify Field(s) & New Value(s) to Update**\n"
                    ."To update **{$target}** without making any assumptions, please tell me **which field(s) and new value(s)** you want to change:\n\n"
                    ."- **Pack Sale Price / Pack Purchase Price** (e.g., `pack sale price 650, pack purchase price 540`)\n"
                    ."- **Pack Size** (e.g., `pack size 200`)\n"
                    ."- **Formulation / Salt** (e.g., `formulation Paracetamol`)\n"
                    ."- **Category / Brand / Supplier** (e.g., `category Tablets, brand GSK, supplier Ali Gohar`)\n"
                    ."- **Rack** (e.g., `rack R-12`)\n\n"
                    ."*(Reply with the changes, or type `cancel` to abort.)*";
                $answerUr = "🪜 **مرحلہ 2 از 2 — تبدیلی کی تفصیل لکھیں**\n"
                    ."**{$target}** کو اپڈیٹ کرنے کے لیے براہِ کرم بتائیں کہ آپ **کون سی فیلڈ اور نئی ویلیو** تبدیل کرنا چاہتے ہیں:\n\n"
                    ."- **Pack Sale Price / Pack Purchase Price** (مثلاً `pack sale price 650`)\n"
                    ."- **Pack Size** (مثلاً `pack size 200`)\n"
                    ."- **Formulation / Brand / Category / Supplier / Rack**\n\n"
                    ."*(جواب میں تبدیلی لکھیں یا منسوخ کرنے کے لیے `cancel` لکھیں۔)*";
                $stepInfo = [
                    'current' => 2,
                    'total' => 2,
                    'label_en' => "Step 2 of 2: Enter Field(s) & New Value(s) for {$target}",
                    'label_ur' => "مرحلہ 2 از 2: {$target} میں تبدیلی کی تفصیل لکھیں",
                ];
            }
        } else {
            $answerEn = "🪜 **Step 1 of 2 — Which Product Should I Search in Your Database?**\n"
                ."Please reply with the **Product Name** or **`PRD-XXXX` code** you want to edit first (or include the field and new value directly).\n\n**Example:**\n`Update product Panadol 500mg Tablet pack sale price to 650 and rack to R-12`";
            $answerUr = "🪜 **مرحلہ 1 از 2 — کس پروڈکٹ کو اپڈیٹ کرنا ہے؟**\n"
                ."براہِ کرم پہلے **پروڈکٹ کا نام یا کوڈ** بتائیں تاکہ میں ڈیٹا بیس میں تلاش کروں۔\n\n**مثال:**\n`Update product Panadol 500mg Tablet pack sale price to 650 and rack to R-12`";
            $stepInfo = [
                'current' => 1,
                'total' => 2,
                'label_en' => 'Step 1 of 2: Enter Product Name or Code to Search Database',
                'label_ur' => 'مرحلہ 1 از 2: ڈیٹا بیس میں تلاش کے لیے پروڈکٹ کا نام لکھیں',
            ];
        }

        return $this->formatTaskResponse(
            titleEn: 'Details Needed to Update Product',
            titleUr: 'پروڈکٹ اپڈیٹ کرنے کے لیے معلومات درکار ہیں',
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'update_products',
                'status' => 'needs_required_fields',
                'updated_count' => 0,
                'missing_fields' => $missingFields,
                'collected_fields' => $target !== '' ? ['target_name_or_code' => $target] : [],
                'step_info' => $stepInfo,
                'db_matches' => $dbMatches,
                'step_choices' => $stepChoices,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_needs_input'
        );
    }

    /**
     * Executes explicit bulk formulation assignments to named products or registers standalone formulations.
     * Never assumes missing formulation names or product names; asks the user if required details are missing.
     *
     * @param  array<string, mixed>  $taskData
     * @return array<string, mixed>
     */
    protected function executeBulkAssignFormulations(User $user, array $taskData, string $productVersion, string $rawText = ''): array
    {
        if (! $this->canUpdateProducts($user) && ! $this->canCreateProducts($user)) {
            return $this->buildPermissionDeniedResponse('product.update', $productVersion);
        }

        $assignments = is_array($taskData['assignments'] ?? null) ? array_values(array_filter($taskData['assignments'], 'is_array')) : [];
        $standalone = is_array($taskData['standalone_formulations'] ?? null) ? array_values(array_filter($taskData['standalone_formulations'], fn ($f) => is_string($f) && trim($f) !== '')) : [];

        // Check if any assignment is missing product_name or formulation, or if both arrays are empty
        $missingAssignmentDetails = empty($assignments) && empty($standalone);
        foreach ($assignments as $aItem) {
            if (trim((string) ($aItem['product_name'] ?? '')) === '' || trim((string) ($aItem['formulation'] ?? '')) === '') {
                $missingAssignmentDetails = true;
                break;
            }
        }

        if ($missingAssignmentDetails) {
            $firstAssign = $assignments[0] ?? ['product_name' => null, 'formulation' => null];
            $this->savePendingTask($user, [
                'action' => 'bulk_assign_formulations',
                'assignments' => [$firstAssign],
            ]);

            $prodName = trim((string) ($firstAssign['product_name'] ?? ''));
            $formName = trim((string) ($firstAssign['formulation'] ?? ''));
            $missingList = [];
            if ($prodName === '') {
                $missingList[] = 'product_name';
            }
            if ($formName === '') {
                $missingList[] = 'formulation';
            }

            $answerEn = $prodName !== '' && $formName === ''
                ? "I won't assume the formulation. What **Formulation (Generic Salt)** would you like to assign to **{$prodName}**?\n\n**Reply example:** `Paracetamol`"
                : ($formName !== '' && $prodName === ''
                    ? "Which **Product Name** would you like to assign the formulation **{$formName}** to?"
                    : "To assign a formulation without assuming any values, please provide:\n1. **Product Name**\n2. **Formulation (Generic Salt)**\n\n**Example:** `Set formulation Paracetamol for Panadol 500mg Tablet`");

            $answerUr = $prodName !== '' && $formName === ''
                ? "کیوب خود سے فارمولیشن فرض نہیں کرے گا۔ براہِ کرم بتائیں کہ **{$prodName}** کے لیے کون سی **فارمولیشن (Generic Salt)** لگانی ہے؟\n\n**مثال:** `Paracetamol`"
                : "براہِ کرم **پروڈکٹ کا نام** اور **فارمولیشن (Generic Salt)** بتائیں۔\n\n**مثال:** `Set formulation Paracetamol for Panadol`";

            return $this->formatTaskResponse(
                titleEn: 'Formulation Details Needed (No Assumptions)',
                titleUr: 'فارمولیشن شامل کرنے کے لیے معلومات درکار ہیں',
                answerEn: $answerEn,
                answerUr: $answerUr,
                links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
                taskMeta: [
                    'action' => 'bulk_assign_formulations',
                    'status' => 'needs_required_fields',
                    'updated_count' => 0,
                    'missing_fields' => $missingList,
                    'collected_fields' => array_filter(['product_name' => $prodName ?: null, 'formulation' => $formName ?: null]),
                ],
                productVersion: $productVersion,
                providerStatus: 'cube_task_needs_input'
            );
        }

        // Always ask for explicit user permission before executing formulation assignment
        $userConfirmed = (bool) ($taskData['user_confirmed'] ?? false);
        if (! $userConfirmed) {
            $this->savePendingTask($user, [
                'action' => 'bulk_assign_formulations',
                'status' => 'awaiting_permission',
                'awaiting_permission' => true,
                'assignments' => $assignments,
                'standalone_formulations' => $standalone,
            ]);

            return $this->buildBulkAssignFormulationsPermissionResponse($assignments, $standalone, $productVersion);
        }

        $this->clearPendingTask($user);

        $updatedProducts = [];
        $registeredFormulations = [];

        foreach ($standalone as $rawForm) {
            $resolved = Formulation::resolveOrCreate((string) $rawForm);
            if ($resolved) {
                $registeredFormulations[] = $resolved->name;
            }
        }

        foreach ($assignments as $item) {
            $prodQuery = trim((string) ($item['product_name'] ?? ''));
            $formName = trim((string) ($item['formulation'] ?? ''));
            if ($prodQuery === '' || $formName === '') {
                continue;
            }

            $resolvedF = Formulation::resolveOrCreate($formName);
            $canonicalSalt = $resolvedF?->name ?? $formName;

            $matchingProducts = Product::query()
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($prodQuery, 'UTF-8')])
                ->orWhere('name', 'like', $prodQuery.'%')
                ->orWhere('product_code', $prodQuery)
                ->limit(25)
                ->get();

            foreach ($matchingProducts as $prod) {
                $prod->formulation = $canonicalSalt;
                $prod->save();
                $updatedProducts[] = [
                    'id' => $prod->id,
                    'product_code' => $prod->product_code,
                    'name' => $prod->name,
                    'formulation' => $canonicalSalt,
                ];
            }
        }

        $linesEn = [];
        $linesUr = [];

        if (! empty($updatedProducts)) {
            $linesEn[] = '✅ **Assigned Formulations to '.count($updatedProducts).' Product(s):**';
            $linesUr[] = '✅ **'.count($updatedProducts).' پروڈکٹ(س) میں فارمولیشن (Generic Salt) شامل کر دی گئی:**';
            foreach ($updatedProducts as $idx => $up) {
                $num = $idx + 1;
                $linesEn[] = "{$num}. **{$up['name']}** (`{$up['product_code']}`) → **{$up['formulation']}**";
                $linesUr[] = "{$num}. **{$up['name']}** (`{$up['product_code']}`) ← **{$up['formulation']}**";
            }
        }

        if (! empty($registeredFormulations)) {
            $listStr = implode(', ', array_map(fn ($f) => "**{$f}**", array_unique($registeredFormulations)));
            $linesEn[] = "✅ **Registered Canonical Formulation(s):** {$listStr}";
            $linesUr[] = "✅ **نئی فارمولیشنز محفوظ کر دی گئیں:** {$listStr}";
        }

        return $this->formatTaskResponse(
            titleEn: 'Bulk Formulation Assignment Completed',
            titleUr: 'پروڈکٹس میں فارمولیشن کامیابی سے اپڈیٹ کر دی گئی',
            answerEn: implode("\n\n", $linesEn) ?: 'No matching products were found for formulation assignment.',
            answerUr: implode("\n\n", $linesUr) ?: 'مطلوبہ پروڈکٹ نہیں ملی۔',
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'bulk_assign_formulations',
                'status' => 'completed',
                'permission_granted' => true,
                'updated_count' => count($updatedProducts),
                'updated_products' => $updatedProducts,
                'registered_formulations' => $registeredFormulations,
                'refresh_products' => ! empty($updatedProducts),
                'result_summary' => [
                    'action_label' => [
                        'en' => 'Assigned Formulations to '.count($updatedProducts).' Product(s)',
                        'ur' => count($updatedProducts).' پروڈکٹ(س) میں فارمولیشن شامل کی گئی',
                    ],
                    'affected_count' => count($updatedProducts),
                    'items' => array_map(fn (array $up): array => [
                        'id' => $up['id'],
                        'code' => $up['product_code'],
                        'name' => $up['name'],
                        'details_en' => 'Formulation → '.$up['formulation'],
                        'details_ur' => 'فارمولیشن ← '.$up['formulation'],
                        'edit_path' => '/products/'.$up['id'].'/edit',
                    ], $updatedProducts),
                ],
            ],
            productVersion: $productVersion
        );
    }

    /**
     * Builds the mandatory user permission confirmation preview before assigning formulations.
     *
     * @param  array<int, array<string, mixed>>  $assignments
     * @param  array<int, string>  $standalone
     * @return array<string, mixed>
     */
    protected function buildBulkAssignFormulationsPermissionResponse(array $assignments, array $standalone, string $productVersion): array
    {
        $previewLinesEn = [];
        $previewLinesUr = [];
        $previewRecords = [];

        foreach ($assignments as $idx => $a) {
            $num = $idx + 1;
            $pName = trim((string) ($a['product_name'] ?? ''));
            $fName = trim((string) ($a['formulation'] ?? ''));

            $matchingProducts = $pName !== ''
                ? Product::query()
                    ->whereRaw('LOWER(name) = ?', [mb_strtolower($pName, 'UTF-8')])
                    ->orWhere('name', 'like', $pName.'%')
                    ->orWhere('product_code', $pName)
                    ->limit(10)
                    ->get(['id', 'product_code', 'name', 'formulation'])
                : collect();

            if ($matchingProducts->isNotEmpty()) {
                foreach ($matchingProducts as $mp) {
                    $previewRecords[] = [
                        'title' => $mp->name,
                        'code_preview' => $mp->product_code,
                        'badge_en' => 'Staged UPDATE',
                        'badge_ur' => 'اپڈیٹ پری ویو',
                        'fields' => [
                            [
                                'field' => 'Formulation (Generic Salt)',
                                'label_ur' => 'فارمولیشن',
                                'before' => $mp->formulation ?: 'Empty',
                                'after' => $fName,
                            ],
                        ],
                    ];
                }
            } else {
                $previewRecords[] = [
                    'title' => $pName,
                    'code_preview' => 'Product Match',
                    'badge_en' => 'Staged UPDATE',
                    'badge_ur' => 'اپڈیٹ پری ویو',
                    'fields' => [
                        [
                            'field' => 'Formulation (Generic Salt)',
                            'label_ur' => 'فارمولیشن',
                            'before' => 'Current',
                            'after' => $fName,
                        ],
                    ],
                ];
            }

            $previewLinesEn[] = "{$num}. Product **{$pName}** → Formulation: **`{$fName}`**";
            $previewLinesUr[] = "{$num}. پروڈکٹ **{$pName}** ← فارمولیشن: **`{$fName}`**";
        }

        if (! empty($standalone)) {
            $listStr = implode(', ', array_map(fn ($s) => "`{$s}`", $standalone));
            $previewLinesEn[] = "• Register Formulation(s): {$listStr}";
            $previewLinesUr[] = "• نئی فارمولیشنز: {$listStr}";
            foreach ($standalone as $sForm) {
                $previewRecords[] = [
                    'title' => (string) $sForm,
                    'code_preview' => 'formulations',
                    'badge_en' => 'Staged INSERT',
                    'badge_ur' => 'نئی فارمولیشن',
                    'fields' => [
                        [
                            'field' => 'Canonical Formulation Name',
                            'label_ur' => 'فارمولیشن کا نام',
                            'before' => null,
                            'after' => (string) $sForm,
                        ],
                    ],
                ];
            }
        }

        $answerEn = "🔒 **User Permission Required — Review Result Before Posting to Database**\n\n"
            ."Cube AI has prepared the following **Formulation Assignment** result preview (**nothing has been posted to the database yet**):\n\n"
            .implode("\n", $previewLinesEn)."\n\n"
            ."**Do you grant permission to post this result to the database?**\n"
            ."Click **\"✅ Approve & Post to Database\"** below (or reply `yes` / `confirm` to proceed, or `cancel` to abort).";

        $answerUr = "🔒 **ڈیٹا بیس میں محفوظ کرنے سے پہلے نتیجہ چیک کریں اور اجازت (Permission) دیں**\n\n"
            ."کیوب اے آئی نے **فارمولیشن تفویض کرنے** کا متوقع نتیجہ تیار کر لیا ہے (**ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا**):\n\n"
            .implode("\n", $previewLinesUr)."\n\n"
            ."**کیا آپ یہ نتیجہ ڈیٹا بیس میں پوسٹ کرنے کی اجازت دیتے ہیں؟**\n"
            ."نیچے **\"✅ اجازت دیں اور ڈیٹا بیس میں محفوظ کریں\"** بٹن پر کلک کریں (یا تصدیق کے لیے `yes` لکھیں، اور منسوخ کرنے کے لیے `cancel` لکھیں)۔";

        return $this->formatTaskResponse(
            titleEn: 'Permission Required: Confirm Formulation Assignment',
            titleUr: 'اجازت درکار ہے: فارمولیشن لگانے کی تصدیق کریں',
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'bulk_assign_formulations',
                'status' => 'awaiting_permission',
                'requires_permission' => true,
                'updated_count' => 0,
                'proposed_assignments' => $assignments,
                'preview_result' => [
                    'staged' => true,
                    'posted_to_database' => false,
                    'database_table' => 'products / formulations',
                    'operation' => 'UPDATE',
                    'operation_label_en' => 'Staged Database Result Preview (Not Posted Yet)',
                    'operation_label_ur' => 'ڈیٹا بیس پری ویو (ابھی محفوظ نہیں کیا گیا)',
                    'records' => $previewRecords,
                ],
                'proposed_task' => [
                    'action' => 'bulk_assign_formulations',
                    'label_en' => 'Assign Formulation(s) to Product(s)',
                    'label_ur' => 'پروڈکٹ(س) میں فارمولیشن شامل کریں',
                    'summary_items_en' => $previewLinesEn,
                    'summary_items_ur' => $previewLinesUr,
                ],
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_awaiting_permission'
        );
    }

    /**
     * Asks for user permission before starting bulk formulation auto-fill from chat,
     * showing a dry-run preview of the exact products and 100%-verified formulations first.
     *
     * @return array<string, mixed>
     */
    protected function requestBulkAutofillPermission(User $user, string $filterQuery, string $productVersion): array
    {
        if (! $this->canUpdateProducts($user) && ! $this->canCreateProducts($user)) {
            return $this->buildPermissionDeniedResponse('product.update', $productVersion);
        }

        $baseQuery = Product::query()
            ->where(function ($q) {
                $q->whereNull('formulation')
                    ->orWhere('formulation', '');
            });

        if ($filterQuery !== '') {
            $baseQuery->where('name', 'like', '%'.$filterQuery.'%');
        }

        $missingCount = (clone $baseQuery)->count();
        $previewBatch = (clone $baseQuery)
            ->orderBy('id')
            ->limit(20)
            ->get(['id', 'product_code', 'name', 'formulation']);

        $previewRecords = [];
        $previewLinesEn = [];
        $previewLinesUr = [];

        foreach ($previewBatch as $prod) {
            $salt = $this->inferFormulationFromProductName((string) $prod->name);
            if ($salt !== null && $salt !== '') {
                $previewRecords[] = [
                    'title' => $prod->name,
                    'code_preview' => $prod->product_code,
                    'badge_en' => '100% Verified Match',
                    'badge_ur' => '100% تصدیق شدہ',
                    'fields' => [
                        [
                            'field' => 'Formulation (Generic Salt)',
                            'label_ur' => 'فارمولیشن',
                            'before' => 'Empty',
                            'after' => $salt,
                        ],
                    ],
                ];
                if (count($previewLinesEn) < 10) {
                    $num = count($previewLinesEn) + 1;
                    $previewLinesEn[] = "{$num}. **{$prod->name}** (`{$prod->product_code}`) → **`{$salt}`**";
                    $previewLinesUr[] = "{$num}. **{$prod->name}** (`{$prod->product_code}`) ← **`{$salt}`**";
                }
            }
        }

        $this->savePendingTask($user, [
            'action' => 'bulk_autofill_missing_formulations',
            'status' => 'awaiting_permission',
            'awaiting_permission' => true,
            'filter_query' => $filterQuery,
            'batch_size' => 20,
        ]);

        $filterNoteEn = $filterQuery !== '' ? " matching `{$filterQuery}`" : '';
        $filterNoteUr = $filterQuery !== '' ? " (`{$filterQuery}` فلٹر کے ساتھ)" : '';

        $summaryItemEn = "Scan `{$missingCount}` product(s) with empty formulation{$filterNoteEn} and auto-fill 100%-verified pharmaceutical salts in background batches of 20.";
        $summaryItemUr = "`{$missingCount}` خالی فارمولیشن والی پروڈکٹس{$filterNoteUr} کو چیک کریں اور صرف 100% تصدیق شدہ ادویات کی فارمولیشن لگائیں۔";

        $sampleBlockEn = ! empty($previewLinesEn)
            ? "\n\n**Preview of Verified Formulations Ready to Post (First Batch):**\n".implode("\n", $previewLinesEn)
            : '';
        $sampleBlockUr = ! empty($previewLinesUr)
            ? "\n\n**پہلے مرحلے میں اپڈیٹ ہونے والی تصدیق شدہ ادویات کا پری ویو:**\n".implode("\n", $previewLinesUr)
            : '';

        $answerEn = "🔒 **User Permission Required — Review Result Before Posting to Database**\n\n"
            ."Cube AI has prepared a dry-run preview for **Background Formulation Auto-Fill** (**nothing has been posted to the database yet**):\n"
            ."- **Target Products Missing Formulation:** `{$missingCount}` product(s){$filterNoteEn}\n"
            ."- **Safety Guarantee:** Strictly fills 100%-verified pharmaceutical salts only (never guesses uncertain names)."
            .$sampleBlockEn."\n\n"
            ."**Do you grant permission to post these formulations to the database?**\n"
            ."Click **\"✅ Approve & Post to Database\"** below (or reply `yes` / `confirm` to proceed, or `cancel` to abort).";

        $answerUr = "🔒 **ڈیٹا بیس میں محفوظ کرنے سے پہلے نتیجہ چیک کریں اور اجازت (Permission) دیں**\n\n"
            ."کیوب اے آئی نے **بیک گراؤنڈ فارمولیشن آٹو فل** کا پری ویو تیار کر لیا ہے (**ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا**):\n"
            ."- **خالی فارمولیشن والی پروڈکٹس:** `{$missingCount}` پروڈکٹ(س){$filterNoteUr}\n"
            ."- **حفاظتی اصول:** صرف 100% تصدیق شدہ ادویات کی فارمولیشن لگائی جائے گی۔"
            .$sampleBlockUr."\n\n"
            ."**کیا آپ یہ تبدیلیاں ڈیٹا بیس میں پوسٹ کرنے کی اجازت دیتے ہیں؟**\n"
            ."نیچے **\"✅ اجازت دیں اور ڈیٹا بیس میں محفوظ کریں\"** بٹن پر کلک کریں (یا تصدیق کے لیے `yes` لکھیں، اور منسوخ کرنے کے لیے `cancel` لکھیں)۔";

        return $this->formatTaskResponse(
            titleEn: 'Permission Required: Confirm Auto-Filling Missing Formulations',
            titleUr: 'اجازت درکار ہے: خودکار فارمولیشن ٹاسک شروع کرنے کی تصدیق کریں',
            answerEn: $answerEn,
            answerUr: $answerUr,
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'bulk_autofill_missing_formulations',
                'status' => 'awaiting_permission',
                'requires_permission' => true,
                'missing_formulation_count' => $missingCount,
                'filter_query' => $filterQuery,
                'preview_result' => [
                    'staged' => true,
                    'posted_to_database' => false,
                    'database_table' => 'products',
                    'operation' => 'UPDATE (Batch Auto-Fill)',
                    'total_missing' => $missingCount,
                    'resolvable_in_preview' => count($previewRecords),
                    'operation_label_en' => "Dry-Run Preview ({$missingCount} Missing • ".count($previewRecords).' Verified in Batch 1)',
                    'operation_label_ur' => "پری ویو ({$missingCount} خالی • ".count($previewRecords).' تصدیق شدہ)',
                    'records' => $previewRecords,
                    'preview_items' => array_map(fn ($r) => [
                        'id' => $r['id'] ?? null,
                        'name' => $r['title'] ?? '',
                        'code' => $r['code'] ?? '',
                        'before' => 'Empty',
                        'after' => $r['fields'][0]['after'] ?? '',
                    ], $previewRecords),
                ],
                'proposed_task' => [
                    'action' => 'bulk_autofill_missing_formulations',
                    'label_en' => "Auto-Fill Missing Formulations ({$missingCount} Product(s) to Scan)",
                    'label_ur' => "خالی فارمولیشنز خودکار پُر کریں ({$missingCount} پروڈکٹس)",
                    'summary_items_en' => array_merge([$summaryItemEn], $previewLinesEn),
                    'summary_items_ur' => array_merge([$summaryItemUr], $previewLinesUr),
                ],
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_awaiting_permission'
        );
    }

    /**
     * Stores an incomplete pending task draft for the user in Cache for 30 minutes.
     *
     * @param  array<string, mixed>  $pendingTask
     */
    protected function savePendingTask(User $user, array $pendingTask): void
    {
        Cache::put($this->pendingTaskCacheKey($user), $pendingTask, now()->addMinutes(30));
    }

    /**
     * Retrieves any active pending task draft for the user.
     *
     * @return ?array<string, mixed>
     */
    protected function getPendingTask(User $user): ?array
    {
        $val = Cache::get($this->pendingTaskCacheKey($user));

        return is_array($val) ? $val : null;
    }

    /**
     * Clears any active pending task draft for the user.
     */
    public function clearPendingTask(User $user): void
    {
        Cache::forget($this->pendingTaskCacheKey($user));
    }

    protected function pendingTaskCacheKey(User $user): string
    {
        return 'cube_pending_task_user_'.$user->id;
    }

    protected function buildTaskCancelledResponse(string $productVersion): array
    {
        return $this->formatTaskResponse(
            titleEn: 'Pending Task Cancelled',
            titleUr: 'زیرِ التواء ٹاسک منسوخ کر دیا گیا',
            answerEn: '✅ The pending task has been cancelled and no changes were saved. Let me know whenever you want to start a new task or ask a question!',
            answerUr: '✅ زیرِ التواء ٹاسک منسوخ کر دیا گیا ہے اور کوئی تبدیلی محفوظ نہیں کی گئی۔',
            links: [],
            taskMeta: [
                'action' => 'task_cancelled',
                'cancelled' => true,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_cancelled'
        );
    }

    /**
     * Background Batch Processor: Automatically identifies and populates missing generic/salt
     * formulations across multiple products at a time using our pharmaceutical dictionary + Groq/Gemini AI.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function executeBulkAutofillMissingFormulations(User $user, array $options = [], string $productVersion = '2026.10'): array
    {
        if (! $this->canUpdateProducts($user) && ! $this->canCreateProducts($user)) {
            return $this->buildPermissionDeniedResponse('product.update', $productVersion);
        }

        $batchSize = max(1, min(30, (int) ($options['batch_size'] ?? 20)));
        $afterId = max(0, (int) ($options['after_id'] ?? 0));
        $filterQuery = trim((string) ($options['filter_query'] ?? ''));

        if (! empty($options['preview_only'])) {
            return $this->requestBulkAutofillPermission($user, $filterQuery, $productVersion);
        }

        $baseQuery = Product::query()
            ->where(function ($q) {
                $q->whereNull('formulation')
                    ->orWhere('formulation', '');
            });

        if ($filterQuery !== '') {
            $baseQuery->where('name', 'like', '%'.$filterQuery.'%');
        }

        $totalMissingBefore = (clone $baseQuery)->count();

        $batchProducts = (clone $baseQuery)
            ->where('id', '>', $afterId)
            ->orderBy('id')
            ->limit($batchSize)
            ->get(['id', 'product_code', 'name', 'formulation']);

        if ($batchProducts->isEmpty()) {
            return $this->formatTaskResponse(
                titleEn: 'All Products Have Formulations',
                titleUr: 'تمام پروڈکٹس میں فارمولیشن پہلے سے موجود ہے',
                answerEn: $totalMissingBefore === 0
                    ? "✅ **All products in your catalog already have a formulation assigned!**\n\nYou can also assign or update specific formulations anytime by typing:\n`Set formulation Paracetamol for Panadol and Calpol`"
                    : '✅ **Background formulation enrichment batch finished!**',
                answerUr: $totalMissingBefore === 0
                    ? "✅ **آپ کے کیٹلاگ کی تمام پروڈکٹس میں فارمولیشن (Generic Salt) پہلے سے موجود ہے!**\n\nاگر آپ کسی مخصوص پروڈکٹ کی فارمولیشن تبدیل کرنا چاہتے ہیں تو لکھیں:\n`Set formulation Paracetamol for Panadol`"
                    : '✅ **پروڈکٹس میں فارمولیشن شامل کرنے کا مرحلہ مکمل ہو گیا!**',
                links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
                taskMeta: [
                    'action' => 'bulk_autofill_missing_formulations',
                    'updated_count' => 0,
                    'updated_products' => [],
                    'background_task' => [
                        'task_type' => 'bulk_autofill_missing_formulations',
                        'has_more' => false,
                        'processed_in_batch' => 0,
                        'remaining_count' => 0,
                        'last_processed_id' => $afterId,
                    ],
                ],
                productVersion: $productVersion
            );
        }

        $resolvedMap = [];
        $unresolvedForAi = [];

        // Pass 1: Strict 100%-verified pharmaceutical dictionary + exact Brand-Core & explicit generic salt matching
        foreach ($batchProducts as $prod) {
            $localSalt = $this->inferFormulationFromProductName((string) $prod->name);
            if ($localSalt !== null && $localSalt !== '') {
                $resolvedMap[$prod->id] = $localSalt;
            } elseif (! $this->isNonMedicineConsumerItem((string) $prod->name)) {
                $unresolvedForAi[$prod->id] = (string) $prod->name;
            }
        }

        // Pass 2: Use connected Groq / Gemini AI ONLY when 100% corroborated (never guessing opaque trade names)
        if (! empty($unresolvedForAi)) {
            $aiSalts = $this->inferBatchFormulationsWithAi($unresolvedForAi);
            foreach ($aiSalts as $pid => $saltName) {
                $cleanSalt = trim((string) $saltName);
                if (
                    $cleanSalt !== '' &&
                    strtolower($cleanSalt) !== 'unknown' &&
                    strtolower($cleanSalt) !== 'null' &&
                    strtolower($cleanSalt) !== 'n/a'
                ) {
                    $resolvedMap[(int) $pid] = $cleanSalt;
                }
            }
        }

        $updatedItems = [];
        $skippedItems = [];
        $lastProcessedId = $afterId;

        foreach ($batchProducts as $prod) {
            $lastProcessedId = max($lastProcessedId, (int) $prod->id);
            $salt = $resolvedMap[$prod->id] ?? null;
            if ($salt === null || trim($salt) === '') {
                $skippedItems[] = [
                    'id' => $prod->id,
                    'product_code' => $prod->product_code,
                    'name' => $prod->name,
                ];
                continue;
            }

            $canonical = Formulation::resolveOrCreate($salt);
            $finalFormulation = $canonical?->name ?? trim($salt);

            $prod->formulation = $finalFormulation;
            $prod->save();

            $updatedItems[] = [
                'id' => $prod->id,
                'product_code' => $prod->product_code,
                'name' => $prod->name,
                'formulation' => $finalFormulation,
            ];
        }

        $remainingAfterBatch = (clone $baseQuery)
            ->where('id', '>', $lastProcessedId)
            ->count();

        $hasMore = $remainingAfterBatch > 0;

        $linesEn = [];
        $linesUr = [];

        if (! empty($updatedItems)) {
            $linesEn[] = '🧪 **Auto-Filled Formulations for '.count($updatedItems).' Product(s) in This Batch:**';
            $linesUr[] = '🧪 **اس مرحلے میں '.count($updatedItems).' پروڈکٹ(س) کی فارمولیشن (Generic Salt) خودکار طریقے سے شامل کر دی گئی:**';

            foreach (array_slice($updatedItems, 0, 15) as $idx => $up) {
                $num = $idx + 1;
                $linesEn[] = "{$num}. **{$up['name']}** (`{$up['product_code']}`) → **{$up['formulation']}**";
                $linesUr[] = "{$num}. **{$up['name']}** (`{$up['product_code']}`) ← **{$up['formulation']}**";
            }

            if (count($updatedItems) > 15) {
                $extra = count($updatedItems) - 15;
                $linesEn[] = "...and **{$extra} more** product(s) in this batch.";
                $linesUr[] = "...اور مزید **{$extra}** پروڈکٹس۔";
            }
        } else {
            $linesEn[] = 'ℹ️ Processed '.count($batchProducts).' product(s) in this batch (no recognizable medicine formulation found for non-medical/custom names).';
            $linesUr[] = 'ℹ️ اس مرحلے کی پروڈکٹس چیک کی گئیں۔';
        }

        if ($hasMore) {
            $linesEn[] = "⏳ **Background Progress:** `{$remainingAfterBatch}` more product(s) without formulation remaining — Cube is continuing in the background automatically...";
            $linesUr[] = "⏳ **بیک گراؤنڈ پراگریس:** مزید `{$remainingAfterBatch}` پروڈکٹس باقی ہیں — کیوب بیک گراؤنڈ میں خودکار طور پر کام جاری رکھے ہوئے ہے...";
        } else {
            $linesEn[] = '🎉 **All batches completed!** Your product catalog formulations are now up to date.';
            $linesUr[] = '🎉 **تمام مراحل مکمل ہو گئے!** آپ کے پروڈکٹ کیٹلاگ میں فارمولیشنز اپڈیٹ ہو چکی ہیں۔';
        }

        return $this->formatTaskResponse(
            titleEn: $hasMore
                ? 'Background Task: Auto-Filling Product Formulations ('.count($updatedItems).' Updated)'
                : 'Completed: Auto-Filled '.count($updatedItems).' Product Formulation(s)',
            titleUr: $hasMore
                ? 'بیک گراؤنڈ ٹاسک: پروڈکٹس میں فارمولیشن شامل کی جا رہی ہے ('.count($updatedItems).' اپڈیٹ)'
                : 'مکمل: '.count($updatedItems).' پروڈکٹس میں فارمولیشن شامل کر دی گئی',
            answerEn: implode("\n\n", $linesEn),
            answerUr: implode("\n\n", $linesUr),
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'bulk_autofill_missing_formulations',
                'status' => 'completed',
                'permission_granted' => true,
                'updated_count' => count($updatedItems),
                'updated_products' => $updatedItems,
                'skipped_products' => $skippedItems,
                'refresh_products' => ! empty($updatedItems),
                'result_summary' => [
                    'action_label' => [
                        'en' => 'Auto-Filled '.count($updatedItems).' Product Formulation(s)',
                        'ur' => count($updatedItems).' پروڈکٹ(س) میں فارمولیشن شامل کی گئی',
                    ],
                    'affected_count' => count($updatedItems),
                    'items' => array_map(fn (array $up): array => [
                        'id' => $up['id'],
                        'code' => $up['product_code'],
                        'name' => $up['name'],
                        'details_en' => 'Formulation → '.$up['formulation'],
                        'details_ur' => 'فارمولیشن ← '.$up['formulation'],
                        'edit_path' => '/products/'.$up['id'].'/edit',
                    ], array_slice($updatedItems, 0, 15)),
                ],
                'background_task' => [
                    'task_type' => 'bulk_autofill_missing_formulations',
                    'has_more' => $hasMore,
                    'processed_in_batch' => count($batchProducts),
                    'updated_in_batch' => count($updatedItems),
                    'remaining_count' => $remainingAfterBatch,
                    'last_processed_id' => $lastProcessedId,
                    'filter_query' => $filterQuery,
                ],
            ],
            productVersion: $productVersion
        );
    }

    /**
     * Infers the active pharmaceutical ingredient (generic salt) for a batch of product names
     * using Groq Primary -> Gemini Backup AI, strictly enforcing 100% certainty and ZERO guessing.
     * Any AI-suggested salt is verified by `verifyAiFormulationIs100PercentCertain` and rejected if it
     * is an uncorroborated guess on an opaque local trade name.
     *
     * @param  array<int, string>  $idToProductName
     * @return array<int, string>
     */
    protected function inferBatchFormulationsWithAi(array $idToProductName): array
    {
        if (empty($idToProductName)) {
            return [];
        }

        try {
            if (Schema::hasTable('settings')) {
                Setting::first()?->applyCubeAiConfig();
            }
        } catch (Throwable) {
            // Ignore
        }

        $systemPrompt = <<<'SYSTEM'
You are a strict, zero-guessing pharmaceutical catalog verifier for Karobar-App.
CRITICAL RULE (NEVER GUESS — 100% CERTAINTY ONLY):
- You MUST NEVER guess, infer from brand prefixes/syllables, or approximate any formulation.
- If a product name is a local/regional/unfamiliar trade name, cosmetic, supplement, surgical item, or if you have even 1% doubt about its exact active pharmaceutical ingredient(s) (including combination variants like Plus, Forte, N, C, M, EZ, HCT, INH), you MUST set its value to null!
- Only provide a formulation when you are 100% certain (for example, when the generic chemical/INN salt name is explicitly present in the product name).
Respond ONLY with a valid JSON object matching this exact schema:
{
  "formulations": {
    "PRODUCT_ID": {
      "formulation": "Exact INN Generic Salt Name or null",
      "certainty": 100
    }
  }
}
SYSTEM;

        $userPrompt = "Return formulations ONLY for products where you are 100% certain (set all others to null):\n"
            .json_encode($idToProductName, JSON_UNESCAPED_UNICODE);

        $decoded = $this->callAiJson($systemPrompt, $userPrompt);
        if (! is_array($decoded)) {
            return [];
        }

        $map = is_array($decoded['formulations'] ?? null) ? $decoded['formulations'] : $decoded;
        $result = [];
        foreach ($map as $k => $v) {
            if (! is_numeric($k)) {
                continue;
            }
            $pid = (int) $k;
            $productName = (string) ($idToProductName[$pid] ?? '');
            if ($productName === '') {
                continue;
            }

            $verifiedSalt = $this->verifyAiFormulationIs100PercentCertain($productName, $v);
            if ($verifiedSalt !== null && $verifiedSalt !== '') {
                $result[$pid] = $verifiedSalt;
            }
        }

        return $result;
    }

    /**
     * Strictly verifies an AI-suggested formulation against the product name and our verified
     * pharmacopoeia so that Cube NEVER saves a guessed or hallucinated formulation.
     */
    protected function verifyAiFormulationIs100PercentCertain(string $productName, mixed $aiEntry): ?string
    {
        $rawSalt = '';
        $certainty = 100;

        if (is_array($aiEntry)) {
            $rawSalt = trim((string) ($aiEntry['formulation'] ?? ($aiEntry['salt'] ?? '')));
            $certainty = isset($aiEntry['certainty']) && is_numeric($aiEntry['certainty'])
                ? (int) $aiEntry['certainty']
                : 0;
        } elseif (is_string($aiEntry)) {
            $rawSalt = trim($aiEntry);
        }

        if (
            $rawSalt === '' ||
            $certainty < 100 ||
            in_array(mb_strtolower($rawSalt, 'UTF-8'), ['null', 'unknown', 'n/a', 'none', 'various', 'multivitamin', 'multivitamins', 'herbal', 'supplement', 'food supplement'], true)
        ) {
            return null;
        }

        // 1. If our deterministic 100%-verified dictionary resolves this product, only accept that exact match
        $deterministic = $this->inferFormulationFromProductName($productName);
        if ($deterministic !== null) {
            return $deterministic;
        }

        // 2. Multi-ingredient strength check (e.g. 10+20mg or 5/500mg MUST have '+' in formulation)
        if ($this->hasMultiIngredientStrength($productName) && ! str_contains($rawSalt, '+')) {
            return null;
        }

        // 3. Zero-Guessing Corroboration Check:
        // Since the product was NOT in our verified brand dictionary, the AI is ONLY allowed to succeed
        // if every active ingredient in `$rawSalt` is a verified INN salt AND is explicitly present
        // in the product name itself (allowing only minor spelling typos >= 84% similarity, e.g. CEFTRIXONE -> Ceftriaxone).
        $knownCanonicalSalts = array_unique(array_values(self::PHARMACY_SALT_DICTIONARY));
        $knownSaltLookup = [];
        foreach ($knownCanonicalSalts as $canonicalCombo) {
            foreach (explode('+', $canonicalCombo) as $part) {
                $cleanPart = trim(preg_replace('/\([^)]*\)/', '', $part) ?? $part);
                if ($cleanPart !== '') {
                    $knownSaltLookup[mb_strtolower($cleanPart, 'UTF-8')] = trim($part);
                }
            }
        }

        $productTokens = preg_split('/[^a-z0-9]+/iu', mb_strtolower($productName, 'UTF-8')) ?: [];
        $productTokens = array_values(array_filter($productTokens, fn ($t) => strlen($t) >= 4));
        $lowerProduct = mb_strtolower($productName, 'UTF-8');

        $ingredients = array_values(array_filter(array_map('trim', explode('+', $rawSalt)), fn ($s) => $s !== ''));
        if (empty($ingredients)) {
            return null;
        }

        $canonicalParts = [];
        foreach ($ingredients as $ing) {
            $cleanIng = trim(preg_replace('/\([^)]*\)/', '', $ing) ?? $ing);
            $lowerIng = mb_strtolower($cleanIng, 'UTF-8');

            // Must be a recognized pharmaceutical salt
            $matchedCanonical = $knownSaltLookup[$lowerIng] ?? null;
            if ($matchedCanonical === null) {
                foreach ($knownSaltLookup as $kLower => $kCanon) {
                    if (str_starts_with($kLower, $lowerIng.' ') || str_starts_with($lowerIng, $kLower.' ')) {
                        $matchedCanonical = $kCanon;
                        break;
                    }
                }
            }
            if ($matchedCanonical === null) {
                return null;
            }

            // Verify that the generic salt name (or its primary word >= 5 chars) is explicitly written in the product name
            $ingWords = array_values(array_filter(
                preg_split('/\s+/', $lowerIng) ?: [],
                fn ($w) => strlen($w) >= 5 && ! in_array($w, ['sodium', 'potassium', 'calcium', 'sulfate', 'sulphate', 'hydrochloride', 'maleate', 'citrate', 'valerate', 'propionate', 'acetate', 'fumarate', 'tartrate', 'mesylate', 'besylate', 'hydrate', 'trihydrate', 'monohydrate'], true)
            ));
            if (empty($ingWords)) {
                $ingWords = [ $lowerIng ];
            }

            $primaryWord = $ingWords[0];
            $corroboratedInName = str_contains($lowerProduct, $primaryWord);
            if (! $corroboratedInName && strlen($primaryWord) >= 6) {
                foreach ($productTokens as $pt) {
                    if (abs(strlen($pt) - strlen($primaryWord)) <= 2) {
                        similar_text($primaryWord, $pt, $pct);
                        if ($pct >= 84.0) {
                            $corroboratedInName = true;
                            break;
                        }
                    }
                }
            }

            if (! $corroboratedInName) {
                return null;
            }

            $canonicalParts[] = $matchedCanonical;
        }

        return implode(' + ', array_unique($canonicalParts));
    }

    /**
     * Calls Groq Primary -> Gemini Backup and returns the decoded JSON array.
     *
     * @return ?array<string, mixed>
     */
    protected function callAiJson(string $systemPrompt, string $userPrompt): ?array
    {
        $primary = (string) config('cube.primary_provider', 'groq');
        $backup = (string) config('cube.backup_provider', 'gemini');
        $providers = array_values(array_unique(array_filter([$primary, $backup])));

        foreach ($providers as $providerName) {
            if (! in_array($providerName, ['groq', 'gemini'], true)) {
                continue;
            }

            $inspection = $this->quotaGuard->inspectProvider($providerName);
            if (! $inspection['can_attempt']) {
                continue;
            }

            $this->quotaGuard->recordAttempt($providerName);

            $res = $providerName === 'groq'
                ? $this->groqProvider->generate($systemPrompt, $userPrompt)
                : $this->geminiProvider->generate($systemPrompt, $userPrompt);

            if (($res['ok'] ?? false) === true && isset($res['data']) && is_array($res['data'])) {
                $this->quotaGuard->recordSuccess($providerName);

                return $res['data'];
            }
        }

        return null;
    }

    /**
     * Infers the pharmaceutical salt / generic formulation from a medicine's name ONLY when
     * 100% certain — using exact Brand-Core matching (`extractBrandCore`) against our verified
     * `PHARMACY_SALT_DICTIONARY` plus multi-ingredient strength verification.
     * Never guesses from partial substrings or mismatched variants.
     */
    public function inferFormulationFromProductName(string $productName): ?string
    {
        $trimmed = trim($productName);
        if ($trimmed === '' || $this->isNonMedicineConsumerItem($trimmed)) {
            return null;
        }

        $brandCore = $this->extractBrandCore($trimmed);
        if ($brandCore === '') {
            return null;
        }

        $candidateSalt = self::PHARMACY_SALT_DICTIONARY[$brandCore] ?? null;

        // Also check if the product explicitly states (ORS) in parentheses
        if ($candidateSalt === null && preg_match('/\(\s*ors\s*\)/iu', $trimmed)) {
            $candidateSalt = 'Oral Rehydration Salts';
        }

        // If brandCore starts with an explicit generic salt + manufacturer suffix (e.g. "folic acid zafa")
        if ($candidateSalt === null) {
            foreach (self::PHARMACY_SALT_DICTIONARY as $dictKey => $dictSalt) {
                // Only match if the dictionary key is itself the canonical generic salt (case-insensitive)
                if (mb_strtolower($dictKey, 'UTF-8') === mb_strtolower($dictSalt, 'UTF-8')) {
                    if ($brandCore === $dictKey) {
                        $candidateSalt = $dictSalt;
                        break;
                    }
                }
            }
        }

        if ($candidateSalt === null) {
            return null;
        }

        // Multi-ingredient strength guard: if product has e.g. "10+20MG" or "5/500MG", salt MUST be a '+' combination
        if ($this->hasMultiIngredientStrength($trimmed) && ! str_contains($candidateSalt, '+')) {
            return null;
        }

        return $candidateSalt;
    }

    /**
     * Extracts the normalized Brand + Variant Core from a product name by stripping dosage forms,
     * strengths, pack counts, and manufacturer codes while preserving combination/variant qualifiers
     * (`n`, `c`, `m`, `ez`, `g`, `h`, `v`, `l`, `t`, `p`, `z`, `plus`, `forte`, `hct`, `cf`, `extra`, `night`, `inh`).
     */
    public function extractBrandCore(string $productName): string
    {
        $s = mb_strtolower(trim($productName), 'UTF-8');
        if ($s === '') {
            return '';
        }

        // Normalize backslashes to forward slashes (e.g., 200MG\5ML -> 200mg/5ml)
        $s = str_replace('\\', '/', $s);

        // Remove parenthetical pack/manufacturer codes like (KPLP) 13453, (HGHN) 7134, (100S), (30'S), (14S)
        $s = preg_replace('/\(\s*[a-z]{3,5}\s*\)\s*\d*/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\(\s*\d+\s*\'?s?\s*\)/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\([^)]*\)/u', ' ', $s) ?? $s;

        // Split glued dosage/strength tokens like "tab1gm" -> "tab 1gm", "1giv" -> "1g iv", "500im" -> "500mg im"
        $s = preg_replace('/\b(tab|cap|syp|inj|susp)(\d)/iu', '$1 $2', $s) ?? $s;
        $s = preg_replace('/(\d+(?:\.\d+)?)\s*(g|gm|mg|mcg|ml)(iv|im|sc|syp|tab|cap|inj)\b/iu', '$1$2 $3', $s) ?? $s;
        $s = preg_replace('/\b(\d+)\s*(iv|im)\b/iu', '$1mg $2', $s) ?? $s;

        // Remove multi-strengths and single strengths with units (e.g. 10+20mg, 1mg/500mg, 200mg/5ml, 100mg/2ml, 1mg/ml, 300mg, 0.5mcg, 1.5miu, 2%, 15grm)
        $s = preg_replace('/\b\d+(?:\.\d+)?\s*(?:[\+\/]\s*\d+(?:\.\d+)?)?\s*(?:mg|mcg|ug|g|gm|grm|kg|ml|l|iu|miu|units?|%)(?:\s*\/\s*\d*(?:\.\d+)?\s*(?:ml|mg|g|gm|l))?\b/iu', ' ', $s) ?? $s;
        // Remove bare slash or plus ratios like "25/5", "10/160", "5/80", "5 / 40", "156.25"
        $s = preg_replace('/\b\d+(?:\.\d+)?\s*[\+\/]\s*\d+(?:\.\d+)?\b/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\b\d+\.\d+\b/u', ' ', $s) ?? $s;

        // Remove pack counts like 100s, 30's, 14s, 1's
        $s = preg_replace('/\b\d+\s*\'?s\b/iu', ' ', $s) ?? $s;

        // Remove dosage form, route, release-profile, and flavor words (NEVER remove variant letters like n, c, m, ez, g, h, v, l, p, z, plus, forte, hct, cf, extra, night, inh)
        $dosageAndFormWords = [
            'tablets', 'tablet', 'tabs', 'tab',
            'capsules', 'capsule', 'capsul', 'caps', 'cap',
            'syrups', 'syrupe', 'syrup', 'syp',
            'suspensions', 'suspension', 'susp',
            'injections', 'injection', 'inj',
            'vials', 'vial', 'ampoules', 'ampoule', 'amps', 'amp', 'infusions', 'infusion',
            'iv', 'im', 'sc',
            'drops', 'drop', 'sprays', 'spray', 'rinse', 'gargle', 'mouthwash',
            'eye', 'ear', 'nasal', 'mouth', 'oral', 'ophth', 'ophthalmic', 'topical', 'vaginal',
            'ointments', 'ointment', 'oint', 'creams', 'cream', 'lotions', 'lotion', 'emulgel', 'gels', 'gel',
            'solutions', 'solution', 'sol',
            'sachets', 'sachet', 'satches', 'satche', 'powders', 'powder', 'granules',
            'inhalers', 'inhaler', 'evohaler', 'rotacaps', 'rotacap', 'respules', 'respule', 'nebules', 'nebule', 'diskus', 'turbuhaler',
            'suppositories', 'suppository', 'supp', 'pessaries', 'pessary',
            'lozenges', 'lozenge', 'linctus', 'elixir', 'emulsion',
            'insta', 'dry', 'film', 'coated', 'enteric', 'dispersible', 'soluble', 'chewable', 'effervescent',
            'paediatric', 'pediatric', 'paed', 'pead', 'junior', 'infant', 'adult',
            'veternary', 'veterinary',
            'ds', 'bd', 'sr', 'mr', 'xr', 'xl', 'cr', 'er', 'la', 'od', 'dr', 'ec',
            'orange', 'lemon', 'strawberry', 'cherry', 'banana', 'mango', 'vanilla', 'chocolate', 'mint', 'honey', 'flavour', 'flavor',
        ];
        $pattern = '/\b(?:'.implode('|', $dosageAndFormWords).')\b/iu';
        $s = preg_replace($pattern, ' ', $s) ?? $s;

        // Normalize punctuation to spaces
        $s = preg_replace('/[^a-z0-9\s]+/iu', ' ', $s) ?? $s;
        $s = trim(preg_replace('/\s+/u', ' ', $s) ?? $s);

        // Preserve special numeric brands ("cac 1000", "cac 1000 plus", "calpol 6 plus") before stripping trailing bare strength numbers
        if (preg_match('/^(cac\s+1000(?:\s+plus)?|calpol\s+6\s+plus)\b/iu', $s, $m)) {
            return mb_strtolower(trim((string) preg_replace('/\s+/', ' ', $m[1])), 'UTF-8');
        }

        // Strip remaining standalone numbers (e.g. trailing item codes or bare mg numbers like "200", "500", "28")
        $s = preg_replace('/\b\d+[a-z]?\b/iu', ' ', $s) ?? $s;
        $s = trim(preg_replace('/\s+/u', ' ', $s) ?? $s);

        return $s;
    }

    /**
     * Detects if a product name specifies a multi-ingredient combination strength
     * (such as `10+20MG`, `1MG/500MG`, `5/160MG`, `25/5 MG`, `5 / 80MG`), excluding
     * liquid concentration ratios like `100MG/2ML` or `200MG/5ML`.
     */
    protected function hasMultiIngredientStrength(string $productName): bool
    {
        $s = str_replace('\\', '/', mb_strtolower($productName, 'UTF-8'));

        // Explicit '+' between two numbers (e.g. 10+20mg, 5+160mg)
        if (preg_match('/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm)?\s*\+\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm)?\b/iu', $s)) {
            return true;
        }

        // Slash between two numbers NOT followed by ml/l/cc/vial/amp (e.g. 1mg/500mg, 25/5 mg, 5/160mg, 5 / 80mg)
        if (preg_match('/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm)?\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|gm)\b/iu', $s)) {
            return true;
        }

        if (preg_match('/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?(?!\s*(?:ml|l|cc|%))\b/iu', $s)) {
            // Ensure it's not a date or fraction followed by ml
            if (! preg_match('/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*(?:ml|l|cc)\b/iu', $s)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns true if the product name is clearly a non-medicine consumer, cosmetic, toiletry,
     * surgical device, or nutritional food item that should never be assigned a drug salt.
     */
    protected function isNonMedicineConsumerItem(string $productName): bool
    {
        return (bool) preg_match(
            '/\b(hair\s+colour|hair\s+color|hair\s+oil|tooth\s*brush|tooth\s*paste|shaving|razor|razer|face\s+wash|body\s+wash|beauty\s+soap|shampoo|conditioner|diaper|pampers|sanitary|cotton|bandage|syringe|cannula|drip\s+set|gloves|thermometer|glucometer|strips|feeder|pacifier|nipple|milk|formula\s+powder|rice\s+pouch|cereal|food\s+supplement|perfume|deodorant|tissue|wipes)\b/iu',
            $productName
        );
    }

    protected function resolveOrCreateCategory(string $name): Category
    {
        $clean = trim($name) ?: 'General';
        $existing = Category::query()->whereRaw('LOWER(name) = ?', [mb_strtolower($clean, 'UTF-8')])->first();
        if ($existing) {
            return $existing;
        }

        return Category::create(['name' => $clean]);
    }

    /**
     * Looks up an existing Brand in the catalog by case-insensitive exact name or numeric ID.
     * Cube NEVER creates a new Brand when adding or updating a product.
     */
    protected function findExistingBrand(string $name): ?Brand
    {
        $clean = trim($name);
        if ($clean === '' || ! Schema::hasTable('brands')) {
            return null;
        }

        $exact = Brand::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($clean, 'UTF-8')])
            ->first();
        if ($exact) {
            return $exact;
        }

        if (ctype_digit($clean)) {
            return Brand::query()->find((int) $clean);
        }

        return null;
    }

    /**
     * Looks up an existing Supplier in the catalog by case-insensitive exact name or numeric ID.
     * Cube NEVER creates a new Supplier when adding or updating a product.
     */
    protected function findExistingSupplier(string $name): ?Supplier
    {
        $clean = trim($name);
        if ($clean === '' || ! Schema::hasTable('suppliers')) {
            return null;
        }

        $exact = Supplier::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($clean, 'UTF-8')])
            ->first();
        if ($exact) {
            return $exact;
        }

        if (ctype_digit($clean)) {
            return Supplier::query()->find((int) $clean);
        }

        return null;
    }

    protected function findProductByNameOrCode(string $target): ?Product
    {
        $clean = trim($target);
        if ($clean === '') {
            return null;
        }

        return Product::query()
            ->whereRaw('LOWER(product_code) = ?', [mb_strtolower($clean, 'UTF-8')])
            ->orWhere('barcode', $clean)
            ->orWhereRaw('LOWER(name) = ?', [mb_strtolower($clean, 'UTF-8')])
            ->first()
            ?? Product::query()
                ->where('name', 'like', $clean.'%')
                ->orderByRaw('LENGTH(name) ASC')
                ->first();
    }

    /**
     * Searches the `products` table in the database for products matching `$query`
     * (by exact code/barcode, exact name, prefix, substring, or primary keyword)
     * so Cube can present existing database items before creating anything new.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function searchMatchingProductsInDb(string $query, int $limit = 6): array
    {
        $clean = trim($query, " \t\n\r\0\x0B.,:-'\"");
        if ($clean === '' || ! Schema::hasTable('products')) {
            return [];
        }

        $lower = mb_strtolower($clean, 'UTF-8');
        $words = array_values(array_filter(
            preg_split('/[\s\-\/]+/', $clean) ?: [],
            fn ($w) => mb_strlen($w, 'UTF-8') >= 4 && ! in_array(mb_strtolower($w, 'UTF-8'), ['tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'injection', 'drops', 'cream', 'ointment', 'lotion', 'sachet', 'suspension', 'product', 'medicine', 'item'], true)
        ));
        $primaryKeyword = $words[0] ?? '';

        $candidates = Product::query()
            ->with(['brand:id,name', 'category:id,name', 'supplier:id,name'])
            ->where(function ($q) use ($clean, $lower, $primaryKeyword) {
                $q->whereRaw('LOWER(product_code) = ?', [$lower])
                    ->orWhere('barcode', $clean)
                    ->orWhereRaw('LOWER(name) = ?', [$lower])
                    ->orWhere('name', 'like', $clean.'%')
                    ->orWhere('name', 'like', '%'.$clean.'%');

                if ($primaryKeyword !== '' && mb_strtolower($primaryKeyword, 'UTF-8') !== $lower) {
                    $q->orWhere('name', 'like', $primaryKeyword.'%');
                }
            })
            ->limit(25)
            ->get();

        // Sort so exact matches come first, then prefix matches, then substring/keyword matches
        $sorted = $candidates->sortBy(function (Product $p) use ($lower): int {
            $pName = mb_strtolower((string) $p->name, 'UTF-8');
            $pCode = mb_strtolower((string) $p->product_code, 'UTF-8');
            if ($pName === $lower || $pCode === $lower) {
                return 0;
            }
            if (str_starts_with($pName, $lower)) {
                return 10 + mb_strlen($pName, 'UTF-8');
            }
            if (str_contains($pName, $lower)) {
                return 100 + mb_strlen($pName, 'UTF-8');
            }

            return 500 + mb_strlen($pName, 'UTF-8');
        })->take($limit)->values();

        $results = [];
        foreach ($sorted as $p) {
            $brandName = optional($p->brand)->name ?? '—';
            $catName = optional($p->category)->name ?? '—';
            $stockQty = (int) ($p->quantity ?? 0);
            $packSale = round((float) ($p->pack_sale_price ?? 0), 2);

            $results[] = [
                'id' => (int) $p->id,
                'code' => (string) $p->product_code,
                'name' => (string) $p->name,
                'brand' => (string) $brandName,
                'category' => (string) $catName,
                'pack_size' => (int) ($p->pack_size ?: 1),
                'pack_sale_price' => $packSale,
                'quantity' => $stockQty,
                'formulation' => $p->formulation ?: null,
                'details_en' => "Code: {$p->product_code} • Brand: {$brandName} • Stock: {$stockQty} units • Pack Sale: Rs. ".number_format($packSale, 2),
                'details_ur' => "کوڈ: {$p->product_code} • برانڈ: {$brandName} • اسٹاک: {$stockQty} یونٹس • پیک قیمت: Rs. ".number_format($packSale, 2),
                'select_reply' => "Select product #{$p->id}: {$p->name}",
            ];
        }

        return $results;
    }

    /**
     * Searches the corresponding Master Entity table (`brands`, `categories`, `suppliers`,
     * `customers`, `storage_locations`, `expense_categories`) for existing records matching `$query`
     * so Cube never excessively creates duplicate records.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function searchMatchingMasterEntitiesInDb(string $action, string $query, int $limit = 6): array
    {
        $clean = trim($query, " \t\n\r\0\x0B.,:-'\"");
        if ($clean === '') {
            return [];
        }

        $lower = mb_strtolower($clean, 'UTF-8');
        $words = array_values(array_filter(
            preg_split('/[\s\-\/]+/', $clean) ?: [],
            fn ($w) => mb_strlen($w, 'UTF-8') >= 4 && ! in_array(mb_strtolower($w, 'UTF-8'), ['pharma', 'pharmaceutical', 'pharmaceuticals', 'laboratories', 'laboratory', 'company', 'distributors', 'distributor', 'traders', 'enterprises', 'agency', 'suppliers', 'supplier', 'general', 'store', 'medical'], true)
        ));
        $primaryKeyword = $words[0] ?? '';

        $applySearch = function ($builder) use ($clean, $lower, $primaryKeyword) {
            $builder->where(function ($q) use ($clean, $lower, $primaryKeyword) {
                $q->whereRaw('LOWER(name) = ?', [$lower])
                    ->orWhere('name', 'like', $clean.'%')
                    ->orWhere('name', 'like', '%'.$clean.'%');

                if ($primaryKeyword !== '' && mb_strtolower($primaryKeyword, 'UTF-8') !== $lower) {
                    $q->orWhere('name', 'like', $primaryKeyword.'%');
                }
            });
        };

        $records = match ($action) {
            'create_brands', 'update_brands' => Schema::hasTable('brands')
                ? Brand::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            'create_categories', 'update_categories' => Schema::hasTable('categories')
                ? Category::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            'create_suppliers', 'update_suppliers' => Schema::hasTable('suppliers')
                ? Supplier::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            'create_customers', 'update_customers' => Schema::hasTable('customers')
                ? Customer::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            'create_storage_locations' => Schema::hasTable('storage_locations')
                ? StorageLocation::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            'create_expense_categories' => Schema::hasTable('expense_categories')
                ? ExpenseCategory::query()->tap($applySearch)->limit($limit)->get()
                : collect(),
            default => collect(),
        };

        $results = [];
        foreach ($records as $rec) {
            $detailsEn = "ID #{$rec->id}";
            $detailsUr = "آئی ڈی #{$rec->id}";

            if (in_array($action, ['create_suppliers', 'update_suppliers', 'create_customers', 'update_customers'], true)) {
                $phone = $rec->phone ?: 'No phone';
                $addr = $rec->address ?: 'No address';
                $detailsEn = "ID #{$rec->id} • Phone: {$phone} • Address: {$addr}";
                $detailsUr = "آئی ڈی #{$rec->id} • فون: {$phone} • پتہ: {$addr}";
            } elseif (isset($rec->code) && $rec->code) {
                $detailsEn = "Code: {$rec->code} • ID #{$rec->id}";
                $detailsUr = "کوڈ: {$rec->code} • آئی ڈی #{$rec->id}";
            }

            $results[] = [
                'id' => (int) $rec->id,
                'code' => isset($rec->code) && $rec->code ? (string) $rec->code : '#'.$rec->id,
                'name' => (string) $rec->name,
                'details_en' => $detailsEn,
                'details_ur' => $detailsUr,
                'select_reply' => "Select existing #{$rec->id}: {$rec->name}",
                'edit_reply' => "Edit existing #{$rec->id}: {$rec->name}",
            ];
        }

        return $results;
    }

    /**
     * @return array{product_code: string, barcode: string}
     */
    protected function generateUniqueCodeAndBarcode(): array
    {
        $lastProduct = Product::orderBy('id', 'desc')->first();
        if ($lastProduct && preg_match('/PRD-(\d+)/', (string) $lastProduct->product_code, $matches)) {
            $nextNum = ((int) $matches[1]) + 1;
        } else {
            $nextNum = Product::count() + 1;
        }

        do {
            $code = 'PRD-'.str_pad((string) $nextNum, 4, '0', STR_PAD_LEFT);
            $nextNum++;
        } while (Product::where('product_code', $code)->exists());

        do {
            $barcode = 'PRD'.str_pad((string) random_int(0, 9999999999), 10, '0', STR_PAD_LEFT);
        } while (Product::where('barcode', $barcode)->exists());

        return [
            'product_code' => $code,
            'barcode' => $barcode,
        ];
    }

    protected function extractOptionalFilterFromPrompt(string $text): string
    {
        if (preg_match('/\b(?:named|like|matching|starting\s+with)\s+([A-Za-z0-9\-]+)/iu', $text, $m)) {
            return trim($m[1]);
        }

        return '';
    }

    protected function canCreateProducts(User $user): bool
    {
        return $user->hasRole(['Admin', 'admin', 'super-admin']) || $user->can('product.create');
    }

    protected function canUpdateProducts(User $user): bool
    {
        return $user->hasRole(['Admin', 'admin', 'super-admin']) || $user->can('product.update');
    }

    protected function buildDeleteBlockedResponse(string $productVersion): array
    {
        return $this->formatTaskResponse(
            titleEn: '🔒 Safety Policy: Deleting Records Is Disabled in Cube',
            titleUr: '🔒 حفاظتی اصول: کیوب (Cube) میں ریکارڈ ڈیلیٹ کرنا ممنوع ہے',
            answerEn: "For your business data protection, **Cube is hardcoded to never delete any records** (products, formulations, categories, brands, invoices, or ledgers).\n\n"
                ."**What Cube CAN do for you automatically:**\n"
                ."1. **➕ Add Products:** e.g. *\"Add product Panadol 500mg, formulation Paracetamol, pack size 200, pack sale price 600\"*\n"
                ."2. **✏️ Edit Products:** e.g. *\"Update product Panadol pack sale price to 650 and rack to R-12\"*\n"
                ."3. **🧪 Auto-Fill Formulations in Background:** e.g. *\"Add formulations to all products missing formulation\"*",
            answerUr: "آپ کے کاروباری ڈیٹا کے تحفظ کے لیے **کیوب (Cube) میں کسی بھی قسم کا ریکارڈ ڈیلیٹ کرنا سختی سے بند (Hardcoded Block) ہے**۔\n\n"
                ."**کیوب آپ کی آسانی کے لیے یہ کام خودکار طور پر کر سکتا ہے:**\n"
                ."1. **➕ نئی پروڈکٹ شامل کرنا:** مثلاً *\"Add product Panadol 500mg, pack size 200, pack sale price 600\"*\n"
                ."2. **✏️ پروڈکٹ ایڈٹ کرنا:** مثلاً *\"Update product Panadol pack sale price to 650 and rack to R-12\"*\n"
                ."3. **🧪 بیک گراؤنڈ میں متعدد پروڈکٹس کی فارمولیشن لگانا:** مثلاً *\"Auto-fill missing formulations for my products\"*",
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'delete_blocked',
                'blocked' => true,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_delete_blocked'
        );
    }

    protected function buildPermissionDeniedResponse(string $permission, string $productVersion): array
    {
        return $this->formatTaskResponse(
            titleEn: 'Permission Required for This Task',
            titleUr: 'اس عمل کے لیے اجازت (Permission) درکار ہے',
            answerEn: "Your user account does not currently have the `{$permission}` permission required to perform this task automatically.",
            answerUr: "آپ کے یوزر اکاؤنٹ کو یہ ٹاسک خودکار طور پر کرنے کے لیے `{$permission}` کی اجازت حاصل نہیں ہے۔",
            links: [['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں']],
            taskMeta: [
                'action' => 'permission_denied',
                'required_permission' => $permission,
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_permission_denied'
        );
    }

    protected function buildUnauthorizedResponse(string $productVersion): array
    {
        return $this->formatTaskResponse(
            titleEn: 'Authentication Required',
            titleUr: 'لاگ ان ہونا ضروری ہے',
            answerEn: 'Please log in to ask Cube to perform product or formulation tasks.',
            answerUr: 'یہ عمل کرنے کے لیے براہِ کرم لاگ ان کریں۔',
            links: [],
            taskMeta: ['action' => 'unauthorized'],
            productVersion: $productVersion,
            providerStatus: 'cube_task_unauthorized'
        );
    }

    /**
     * Extracts fields for Brands, Categories, Suppliers, Customers, User Demands,
     * Storage Locations, and Expense Categories from natural language.
     *
     * @return array<string, mixed>
     */
    protected function extractMasterEntityFieldsLocally(string $action, string $rawText): array
    {
        $text = trim($rawText);
        $data = ['action' => $action];

        if (preg_match('/\bphone\s*(?:number|no)?\s*(?:is|to|=|:)?\s*([\+\d\-\s]{7,20})/iu', $text, $m)) {
            $data['phone'] = trim($m[1]);
        }
        if (preg_match('/\bemail\s*(?:is|to|=|:)?\s*([^\s,;]+@[^\s,;]+)/iu', $text, $m)) {
            $data['email'] = trim($m[1]);
        }
        if (preg_match('/\baddress\s*(?:is|to|=|:)\s*([^,;\n]+)/iu', $text, $m)) {
            $data['address'] = trim($m[1]);
        }
        if (preg_match('/\bcredit\s*limit\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)/iu', $text, $m)) {
            $data['credit_limit'] = (float) $m[1];
        }
        if (preg_match('/\bcredit\s*days?\s*(?:is|to|=|:)?\s*(\d+)/iu', $text, $m)) {
            $data['credit_days'] = (int) $m[1];
        }
        if (preg_match('/\b(?:qty|quantity)\s*(?:is|to|=|:)?\s*(\d+)/iu', $text, $m)) {
            $data['requested_quantity'] = max(1, (int) $m[1]);
        }
        if (preg_match('/\bcode\s*(?:is|to|=|:)\s*([A-Za-z0-9\-_]+)/iu', $text, $m)) {
            $data['code'] = strtoupper(trim($m[1]));
        }
        if (preg_match('/\b(?:default\s*rack|rack)\s*(?:is|to|=|:)\s*([A-Za-z0-9\-_]+)/iu', $text, $m)) {
            $data['default_rack'] = trim($m[1]);
        }
        if (preg_match('/\b(?:notes?|description)\s*(?:is|to|=|:)\s*([^;\n]+)/iu', $text, $m)) {
            $data['notes'] = trim($m[1]);
            $data['description'] = trim($m[1]);
        }
        if (preg_match('/\bexpiry\s*(?:return\s*)?months?\s*(?:is|to|=|:)?\s*(\d+)/iu', $text, $m)) {
            $data['expiry_return_months'] = (int) $m[1];
        }

        if (str_starts_with($action, 'update_')) {
            if (preg_match('/\b(?:rename|change\s+name\s+to|new\s+name|name\s+to)\s+([A-Za-z0-9\s\-\&\.\(\)]+?)(?=,|;|\n|\bphone\b|\baddress\b|\bemail\b|\bcredit\b|\bexpiry\b|$)/iu', $text, $m)) {
                $data['new_name'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            }
            $body = preg_replace('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:edit|update|change|modify)\s+(?:the\s+)?(?:brand|manufacturer|company|category|product\s+category|supplier|distributor|vendor|customer|patient|client)\b\s*(?:named|called|:)?\s*/iu', '', $text) ?? $text;
            $lead = preg_split('/(?:,|;|\n|\bphone\b|\baddress\b|\bemail\b|\bcredit\b|\bexpiry\b|\brename\b|\bchange\s+name\b|\bname\s+to\b|\bset\b)/iu', $body)[0] ?? '';
            $lead = trim($lead, " \t\n\r\0\x0B.,:-");
            if ($lead !== '') {
                $data['target_name'] = $lead;
            }
        } else {
            if (preg_match('/\bname\s*(?:is|to|=|:)\s*([A-Za-z0-9\s\-\&\.\(\)\+]+?)(?=,|;|\n|\bphone\b|\baddress\b|\bemail\b|\bcredit\b|\bqty\b|\bquantity\b|\bcode\b|\brack\b|\bnotes?\b|\bdescription\b|$)/iu', $text, $m)) {
                $data['name'] = trim($m[1], " \t\n\r\0\x0B.,:-");
            } else {
                $body = preg_replace('/^(?:please\s+|cube\s+|plz\s+|can\s+you\s+)?(?:add|create|register|insert|make|record|log)\s+(?:a\s+)?(?:new\s+)?(?:brand|manufacturer|company|expense\s+category|category|product\s+category|supplier|distributor|vendor|customer|patient|client|user\s+demand|demand|short\s+item|missing\s+medicine|storage\s+location|warehouse\s+location)\b\s*(?:for|named|called|:)?\s*/iu', '', $text) ?? $text;
                $lead = preg_split('/(?:,|;|\n|\bphone\b|\baddress\b|\bemail\b|\bcredit\b|\bqty\b|\bquantity\b|\bcode\b|\brack\b|\bnotes?\b|\bdescription\b|\bexpiry\b)/iu', $body)[0] ?? '';
                $lead = trim($lead, " \t\n\r\0\x0B.,:-");
                if ($lead !== '') {
                    $data['name'] = $lead;
                }
            }
        }

        return $data;
    }

    /**
     * Merges a follow-up user reply into a pending master-entity task payload,
     * supporting step-by-step disambiguation of existing database matches, quantity input,
     * and optional contact details without overwriting already-collected fields.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function mergeMasterEntityReply(string $action, array $payload, string $replyText): array
    {
        $trimmed = trim($replyText);
        $lower = mb_strtolower($trimmed, 'UTF-8');
        $cleanReply = trim($trimmed, " \t\n\r\0\x0B.,:-");
        $currentStep = (string) ($payload['step'] ?? '');
        $dbMatches = is_array($payload['db_matches'] ?? null) ? $payload['db_matches'] : [];

        // 1. Handle User Demand Step 2: Select existing product from DB or confirm new unlisted item
        if ($action === 'create_user_demands' && in_array($currentStep, ['select_product_or_new', 'confirm_unlisted_item'], true)) {
            $extracted = $this->extractMasterEntityFieldsLocally($action, $replyText);
            if (! empty($extracted['requested_quantity'])) {
                $payload['requested_quantity'] = (int) $extracted['requested_quantity'];
            }
            if (! empty($extracted['notes'])) {
                $payload['notes'] = $extracted['notes'];
            }

            // Explicit "Select product #ID: Name" or "#ID"
            if (preg_match('/(?:select\s+(?:product|existing)\s*#(\d+)|#(\d+))/iu', $trimmed, $m)) {
                $selId = (int) ($m[1] ?: ($m[2] ?? 0));
                foreach ($dbMatches as $dm) {
                    if ((int) ($dm['id'] ?? 0) === $selId) {
                        $payload['selected_product_id'] = (int) $dm['id'];
                        $payload['selected_product_code'] = (string) ($dm['code'] ?? '');
                        $payload['name'] = (string) $dm['name'];
                        unset($payload['step']);

                        return $payload;
                    }
                }
                $foundProd = Product::find($selId);
                if ($foundProd) {
                    $payload['selected_product_id'] = (int) $foundProd->id;
                    $payload['selected_product_code'] = (string) $foundProd->product_code;
                    $payload['name'] = (string) $foundProd->name;
                    unset($payload['step']);

                    return $payload;
                }
            }

            // Numeric option index (e.g. "1", "2", "option 1", "select 1") when DB matches exist
            if (! empty($dbMatches) && preg_match('/^(?:option\s+|select\s+|item\s+)?(\d+)$/iu', $cleanReply, $idxMatch)) {
                $choiceIdx = ((int) $idxMatch[1]) - 1;
                if (isset($dbMatches[$choiceIdx])) {
                    $dm = $dbMatches[$choiceIdx];
                    $payload['selected_product_id'] = (int) $dm['id'];
                    $payload['selected_product_code'] = (string) ($dm['code'] ?? '');
                    $payload['name'] = (string) $dm['name'];
                    unset($payload['step']);

                    return $payload;
                }
            }

            // "use existing" / "select existing"
            if (! empty($dbMatches) && preg_match('/^(?:use\s+existing|select\s+existing|existing|first\s+one)$/iu', $lower)) {
                $dm = $dbMatches[0];
                $payload['selected_product_id'] = (int) $dm['id'];
                $payload['selected_product_code'] = (string) ($dm['code'] ?? '');
                $payload['name'] = (string) $dm['name'];
                unset($payload['step']);

                return $payload;
            }

            // Match by exact code or name against `$dbMatches`
            foreach ($dbMatches as $dm) {
                if (
                    mb_strtolower((string) ($dm['code'] ?? ''), 'UTF-8') === $lower ||
                    mb_strtolower((string) ($dm['name'] ?? ''), 'UTF-8') === $lower
                ) {
                    $payload['selected_product_id'] = (int) $dm['id'];
                    $payload['selected_product_code'] = (string) ($dm['code'] ?? '');
                    $payload['name'] = (string) $dm['name'];
                    unset($payload['step']);

                    return $payload;
                }
            }

            // Confirm recording as a new unlisted item
            if (
                preg_match('/\b(?:create\s+new|new\s+unlisted|unlisted|record\s+as\s+new|new\s+item|add\s+as\s+new|create\s+anyway)\b/iu', $lower) ||
                ($currentStep === 'confirm_unlisted_item' && preg_match('/^(?:yes|y|ok|okay|confirm|proceed|1)$/iu', $lower))
            ) {
                $payload['confirmed_new_unlisted_item'] = true;
                unset($payload['step']);

                return $payload;
            }

            // Otherwise user typed a different product name to search in DB again
            $newSearch = preg_replace('/^(?:search\s+for|search|find|try)\s+/iu', '', $cleanReply) ?? $cleanReply;
            if ($newSearch !== '') {
                $payload['name'] = trim($newSearch);
                unset($payload['selected_product_id'], $payload['selected_product_code'], $payload['confirmed_new_unlisted_item'], $payload['step'], $payload['db_matches']);
            }

            return $payload;
        }

        // 2. Handle User Demand Step 3: Ask Quantity
        if ($action === 'create_user_demands' && $currentStep === 'ask_quantity') {
            if (preg_match('/\b(?:qty|quantity)\s*(?:is|to|=|:)?\s*(\d+)/iu', $trimmed, $qm)) {
                $payload['requested_quantity'] = max(1, (int) $qm[1]);
            } elseif (preg_match('/^(\d+)(?:\s*(?:packs?|units?|tabs?|tablets?|caps?|bottles?|boxes?|pcs?))?/iu', $cleanReply, $bm)) {
                $payload['requested_quantity'] = max(1, (int) $bm[1]);
            }

            if (preg_match('/\b(?:notes?|description)\s*(?:is|to|=|:)\s*([^;\n]+)/iu', $trimmed, $nm)) {
                $payload['notes'] = trim($nm[1]);
            }

            unset($payload['step']);

            return $payload;
        }

        // 3. Handle Master Entity Step: Resolve DB Matches (`resolve_db_matches`)
        if ($currentStep === 'resolve_db_matches') {
            if (preg_match('/^(?:select\s+existing\s*#(\d+)|use\s+existing(?:\s*#(\d+))?|#(\d+))/iu', $trimmed, $sm)) {
                $selId = (int) ($sm[1] ?: ($sm[2] ?: ($sm[3] ?: ($dbMatches[0]['id'] ?? 0))));
                if ($selId > 0) {
                    $payload['selected_existing_id'] = $selId;
                    foreach ($dbMatches as $dm) {
                        if ((int) ($dm['id'] ?? 0) === $selId) {
                            $payload['selected_existing_name'] = (string) $dm['name'];
                            break;
                        }
                    }
                    unset($payload['step']);

                    return $payload;
                }
            }

            if (! empty($dbMatches) && preg_match('/^(?:option\s+|select\s+)?(\d+)$/iu', $cleanReply, $idxM)) {
                $cIdx = ((int) $idxM[1]) - 1;
                if (isset($dbMatches[$cIdx])) {
                    $payload['selected_existing_id'] = (int) $dbMatches[$cIdx]['id'];
                    $payload['selected_existing_name'] = (string) $dbMatches[$cIdx]['name'];
                    unset($payload['step']);

                    return $payload;
                }
            }

            if (preg_match('/^(?:edit\s+existing(?:\s*#(\d+))?)/iu', $trimmed, $em)) {
                $editId = (int) ($em[1] ?: ($dbMatches[0]['id'] ?? 0));
                if ($editId > 0) {
                    $payload['switch_to_update_id'] = $editId;
                    foreach ($dbMatches as $dm) {
                        if ((int) ($dm['id'] ?? 0) === $editId) {
                            $payload['switch_to_update_name'] = (string) $dm['name'];
                            break;
                        }
                    }
                    unset($payload['step']);

                    return $payload;
                }
            }

            if (preg_match('/\b(?:create\s+new|create\s+anyway|new\s+anyway|add\s+as\s+new|confirm\s+create\s+new)\b/iu', $lower)) {
                $payload['confirmed_create_new'] = true;
                unset($payload['step']);

                return $payload;
            }
        }

        // 4. Handle Supplier / Customer Step: Optional Contact Details (`ask_contact_details`)
        if ($currentStep === 'ask_contact_details') {
            if (preg_match('/^(?:skip|skip\s+optional(?:\s+details)?|none|no\s+phone|next|preview)$/iu', $lower)) {
                $payload['contact_step_done'] = true;
                unset($payload['step']);

                return $payload;
            }

            $extracted = $this->extractMasterEntityFieldsLocally($action, $replyText);
            foreach (['phone', 'email', 'address', 'credit_limit', 'credit_days', 'expiry_return_months'] as $ck) {
                if (isset($extracted[$ck]) && $extracted[$ck] !== '') {
                    $payload[$ck] = $extracted[$ck];
                }
            }

            // Support bare phone number or "03001234567, Lahore" without labels
            if (empty($payload['phone']) && preg_match('/(\+?\d[\d\-\s]{6,18}\d)/', $cleanReply, $pm)) {
                $payload['phone'] = trim($pm[1]);
                $remAddr = trim(str_replace($pm[0], '', $cleanReply), " \t\n\r\0\x0B.,;-");
                if ($remAddr !== '' && empty($payload['address'])) {
                    $payload['address'] = $remAddr;
                }
            } elseif (empty($payload['address']) && empty($extracted['phone']) && $cleanReply !== '') {
                $payload['address'] = $cleanReply;
            }

            $payload['contact_step_done'] = true;
            unset($payload['step']);

            return $payload;
        }

        // Standard extraction for general follow-ups
        $extracted = $this->extractMasterEntityFieldsLocally($action, $replyText);
        foreach ($extracted as $k => $v) {
            if ($k === 'action') {
                continue;
            }
            // Do not overwrite already-set `name` or `target_name` unless explicitly labeled
            if (in_array($k, ['name', 'target_name'], true) && ! empty($payload[$k]) && ! preg_match('/\bname\s*(?:is|to|=|:)/iu', $replyText)) {
                continue;
            }
            if ($v !== null && $v !== '') {
                $payload[$k] = $v;
            }
        }

        if (str_starts_with($action, 'update_')) {
            if (empty($payload['target_name']) && $cleanReply !== '') {
                $payload['target_name'] = $cleanReply;
            }
        } else {
            if (empty($payload['name']) && $cleanReply !== '') {
                $payload['name'] = $cleanReply;
            }
        }

        return $payload;
    }

    /**
     * Executes or stages a Master Entity ERP Task (Brands, Categories, Suppliers, Customers,
     * User Demands, Storage Locations, Expense Categories) in clear, logical steps.
     * Always searches the database first for existing matches so duplicate items are not excessively created,
     * and always displays the staged database result preview (`preview_result`) before posting to the database.
     *
     * @param  array<string, mixed>  $taskData
     * @return array<string, mixed>
     */
    protected function executeMasterEntityTask(User $user, string $action, array $taskData, string $productVersion, bool $userConfirmed = false): array
    {
        $entityConfig = match ($action) {
            'create_brands', 'update_brands' => [
                'label_en' => 'Brand',
                'label_ur' => 'برانڈ (Brand)',
                'table' => 'brands',
                'link' => ['path' => '/brands', 'en' => 'Open Brands Page', 'ur' => 'برانڈز پیج کھولیں'],
            ],
            'create_categories', 'update_categories' => [
                'label_en' => 'Category',
                'label_ur' => 'کیٹیگری (Category)',
                'table' => 'categories',
                'link' => ['path' => '/categories', 'en' => 'Open Categories Page', 'ur' => 'کیٹیگریز پیج کھولیں'],
            ],
            'create_suppliers', 'update_suppliers' => [
                'label_en' => 'Supplier',
                'label_ur' => 'سپلائر (Supplier)',
                'table' => 'suppliers',
                'link' => ['path' => '/suppliers', 'en' => 'Open Suppliers Page', 'ur' => 'سپلائرز پیج کھولیں'],
            ],
            'create_customers', 'update_customers' => [
                'label_en' => 'Customer',
                'label_ur' => 'کسٹمر (Customer)',
                'table' => 'customers',
                'link' => ['path' => '/customers', 'en' => 'Open Customers Page', 'ur' => 'کسٹمرز پیج کھولیں'],
            ],
            'create_user_demands' => [
                'label_en' => 'User Demand (Short Item)',
                'label_ur' => 'کسٹمر ڈیمانڈ (User Demand)',
                'table' => 'user_demands',
                'link' => ['path' => '/user-demands', 'en' => 'Open User Demands', 'ur' => 'یوزر ڈیمانڈز کھولیں'],
            ],
            'create_storage_locations' => [
                'label_en' => 'Storage Location',
                'label_ur' => 'اسٹوریج لوکیشن (Storage Location)',
                'table' => 'storage_locations',
                'link' => ['path' => '/storage-locations', 'en' => 'Open Storage Locations', 'ur' => 'اسٹوریج لوکیشنز کھولیں'],
            ],
            'create_expense_categories' => [
                'label_en' => 'Expense Category',
                'label_ur' => 'اخراجات کی کیٹیگری (Expense Category)',
                'table' => 'expense_categories',
                'link' => ['path' => '/expenses', 'en' => 'Open Expenses Page', 'ur' => 'اخراجات پیج کھولیں'],
            ],
            default => [
                'label_en' => 'Record',
                'label_ur' => 'ریکارڈ',
                'table' => 'records',
                'link' => ['path' => '/dashboard', 'en' => 'Open Dashboard', 'ur' => 'ڈیش بورڈ کھولیں'],
            ],
        };

        $isUpdate = str_starts_with($action, 'update_');
        $labelEn = $entityConfig['label_en'];
        $labelUr = $entityConfig['label_ur'];
        $table = $entityConfig['table'];
        $link = $entityConfig['link'];

        if ($isUpdate) {
            $targetName = trim((string) ($taskData['target_name'] ?? $taskData['name'] ?? ''));
            if ($targetName === '' && empty($taskData['selected_existing_id'])) {
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => false,
                    'payload' => $taskData,
                ]);

                return $this->formatTaskResponse(
                    titleEn: "✏️ Step 1 of 3 — Update {$labelEn}: Which {$labelEn} Should I Search in Database?",
                    titleUr: "✏️ مرحلہ 1 از 3 — {$labelUr} اپڈیٹ: کس ریکارڈ کو ڈیٹا بیس میں تلاش کرنا ہے؟",
                    answerEn: "🪜 **Step 1 of 3 — Enter {$labelEn} Name**\nPlease tell me the **{$labelEn} name** you want to update. I will search your database first and show matching records.\n\n*Cancel anytime by typing `cancel`.*",
                    answerUr: "🪜 **مرحلہ 1 از 3 — {$labelUr} کا نام لکھیں**\nبراہِ کرم اس **{$labelUr}** کا نام لکھیں جسے آپ اپڈیٹ کرنا چاہتے ہیں۔ میں پہلے ڈیٹا بیس میں تلاش کروں گا۔",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 1,
                            'total' => 3,
                            'label_en' => "Step 1 of 3: Enter {$labelEn} Name to Search DB",
                            'label_ur' => "مرحلہ 1 از 3: ڈیٹا بیس میں تلاش کے لیے {$labelUr} کا نام لکھیں",
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }

            // If multiple records match in DB and no exact match or explicit selection was made yet, let the user select from DB matches
            if (empty($taskData['selected_existing_id'])) {
                $exactCheck = match ($action) {
                    'update_brands' => Brand::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first(),
                    'update_categories' => Category::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first(),
                    'update_suppliers' => Supplier::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first(),
                    'update_customers' => Customer::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first(),
                    default => null,
                };

                if (! $exactCheck) {
                    $dbMatches = $this->searchMatchingMasterEntitiesInDb($action, $targetName, 6);
                    if (count($dbMatches) > 1) {
                        $taskData['step'] = 'resolve_db_matches';
                        $taskData['db_matches'] = $dbMatches;
                        $this->savePendingTask($user, [
                            'action' => $action,
                            'awaiting_permission' => false,
                            'payload' => $taskData,
                        ]);

                        $matchLinesEn = [];
                        $matchLinesUr = [];
                        $stepChoices = [];
                        foreach ($dbMatches as $idx => $m) {
                            $num = $idx + 1;
                            $matchLinesEn[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_en']}";
                            $matchLinesUr[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_ur']}";
                            $stepChoices[] = [
                                'label_en' => "✓ Select: {$m['name']}",
                                'label_ur' => "✓ منتخب کریں: {$m['name']}",
                                'reply' => $m['select_reply'],
                                'variant' => 'primary',
                            ];
                        }

                        return $this->formatTaskResponse(
                            titleEn: "🔍 Step 2 of 3 — Multiple Matching {$labelEn}s Found in Database",
                            titleUr: "🔍 مرحلہ 2 از 3 — ڈیٹا بیس میں ایک سے زیادہ ملتے جلتے {$labelUr} ملے",
                            answerEn: "🔍 I searched your database for **`\"{$targetName}\"`** and found **".count($dbMatches)." matching {$labelEn}s**:\n\n"
                                .implode("\n", $matchLinesEn)."\n\n"
                                ."Please select which **{$labelEn}** you want to update:",
                            answerUr: "🔍 ڈیٹا بیس میں **`\"{$targetName}\"`** تلاش کرنے پر **".count($dbMatches)." ملتے جلتے ریکارڈز** ملے:\n\n"
                                .implode("\n", $matchLinesUr)."\n\n"
                                ."براہِ کرم منتخب کریں کہ کس ریکارڈ کو اپڈیٹ کرنا ہے:",
                            links: [$link],
                            taskMeta: [
                                'action' => $action,
                                'awaiting_input' => true,
                                'step_info' => [
                                    'current' => 2,
                                    'total' => 3,
                                    'label_en' => "Step 2 of 3: Select {$labelEn} from Database Matches",
                                    'label_ur' => "مرحلہ 2 از 3: ڈیٹا بیس سے مطلوبہ {$labelUr} منتخب کریں",
                                ],
                                'db_matches' => $dbMatches,
                                'step_choices' => $stepChoices,
                            ],
                            productVersion: $productVersion,
                            providerStatus: 'cube_task_needs_input'
                        );
                    }
                }
            }

            $existing = ! empty($taskData['selected_existing_id'])
                ? match ($action) {
                    'update_brands' => Brand::find((int) $taskData['selected_existing_id']),
                    'update_categories' => Category::find((int) $taskData['selected_existing_id']),
                    'update_suppliers' => Supplier::find((int) $taskData['selected_existing_id']),
                    'update_customers' => Customer::find((int) $taskData['selected_existing_id']),
                    default => null,
                }
                : match ($action) {
                    'update_brands' => Brand::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first()
                        ?? Brand::where('name', 'like', $targetName.'%')->first(),
                    'update_categories' => Category::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first()
                        ?? Category::where('name', 'like', $targetName.'%')->first(),
                    'update_suppliers' => Supplier::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first()
                        ?? Supplier::where('name', 'like', $targetName.'%')->first(),
                    'update_customers' => Customer::whereRaw('LOWER(name) = ?', [mb_strtolower($targetName, 'UTF-8')])->first()
                        ?? Customer::where('name', 'like', $targetName.'%')->first(),
                    default => null,
                };

            if (! $existing) {
                $this->clearPendingTask($user);

                return $this->formatTaskResponse(
                    titleEn: "⚠️ {$labelEn} Not Found",
                    titleUr: "⚠️ {$labelUr} نہیں ملا",
                    answerEn: "I could not find an existing **{$labelEn}** matching `\"{$targetName}\"` in your database.",
                    answerUr: "ڈیٹا بیس میں `\"{$targetName}\"` کے نام سے کوئی **{$labelUr}** نہیں ملا۔",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'not_found' => [$targetName],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_executed'
                );
            }

            $fieldsPreview = [];
            if (! empty($taskData['new_name']) && $taskData['new_name'] !== $existing->name) {
                $fieldsPreview[] = ['field' => 'Name', 'before' => $existing->name, 'after' => (string) $taskData['new_name']];
            }
            if (in_array($action, ['update_suppliers', 'update_customers'], true)) {
                if (isset($taskData['phone']) && $taskData['phone'] !== '') {
                    $fieldsPreview[] = ['field' => 'Phone', 'before' => (string) ($existing->phone ?: 'None'), 'after' => (string) $taskData['phone']];
                }
                if (isset($taskData['email']) && $taskData['email'] !== '') {
                    $fieldsPreview[] = ['field' => 'Email', 'before' => (string) ($existing->email ?: 'None'), 'after' => (string) $taskData['email']];
                }
                if (isset($taskData['address']) && $taskData['address'] !== '') {
                    $fieldsPreview[] = ['field' => 'Address', 'before' => (string) ($existing->address ?: 'None'), 'after' => (string) $taskData['address']];
                }
                if (isset($taskData['credit_limit'])) {
                    $fieldsPreview[] = ['field' => 'Credit Limit', 'before' => number_format((float) ($existing->credit_limit ?? 0), 2), 'after' => number_format((float) $taskData['credit_limit'], 2)];
                }
                if (isset($taskData['credit_days'])) {
                    $fieldsPreview[] = ['field' => 'Credit Days', 'before' => (string) ($existing->credit_days ?? 0), 'after' => (string) ((int) $taskData['credit_days'])];
                }
            }
            if (in_array($action, ['update_brands', 'update_suppliers'], true) && isset($taskData['expiry_return_months'])) {
                $fieldsPreview[] = [
                    'field' => 'Expiry Return Months',
                    'before' => (string) ($existing->expiry_return_months ?? 3),
                    'after' => (string) ((int) $taskData['expiry_return_months']),
                ];
            }

            if (empty($fieldsPreview)) {
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => false,
                    'payload' => array_merge($taskData, ['target_name' => $existing->name, 'selected_existing_id' => $existing->id]),
                ]);

                return $this->formatTaskResponse(
                    titleEn: "✏️ Step 2 of 3 — Update {$labelEn}: What Should I Change on {$existing->name}?",
                    titleUr: "✏️ مرحلہ 2 از 3 — {$existing->name} میں کیا تبدیلی کرنی ہے؟",
                    answerEn: "🪜 **Step 2 of 3 — Specify Changes**\nI selected **{$existing->name}** (ID `#{$existing->id}`) from your database. Please tell me what field you want to update (e.g., `rename to NewName`, `phone 03001234567`, `address Lahore`, `credit limit 50000`).",
                    answerUr: "🪜 **مرحلہ 2 از 3 — تبدیلی کی تفصیل لکھیں**\nڈیٹا بیس سے **{$existing->name}** منتخب کر لیا گیا۔ براہِ کرم بتائیں کہ اس میں کیا تبدیلی کرنی ہے؟",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 2,
                            'total' => 3,
                            'label_en' => "Step 2 of 3: Specify Field(s) to Update on {$existing->name}",
                            'label_ur' => "مرحلہ 2 از 3: {$existing->name} میں تبدیلی کی تفصیل لکھیں",
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }

            if (! $userConfirmed) {
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => true,
                    'payload' => array_merge($taskData, ['target_name' => $existing->name, 'selected_existing_id' => $existing->id]),
                ]);

                $previewLinesEn = ["### ✏️ {$labelEn}: **{$existing->name}** (ID `#{$existing->id}`)"];
                $previewLinesUr = ["### ✏️ {$labelUr}: **{$existing->name}** (ID `#{$existing->id}`)"];
                foreach ($fieldsPreview as $fp) {
                    $previewLinesEn[] = "- **{$fp['field']}:** `{$fp['before']}` → **`{$fp['after']}`**";
                    $previewLinesUr[] = "- **{$fp['field']}:** `{$fp['before']}` ← **`{$fp['after']}`**";
                }

                return $this->formatTaskResponse(
                    titleEn: "🔐 Permission Required: Preview {$labelEn} Update Before Saving",
                    titleUr: "🔐 اجازت درکار ہے: {$labelUr} اپڈیٹ کرنے سے پہلے تصدیق کریں",
                    answerEn: "Here is the exact **staged database result preview** for **{$existing->name}** (**not posted to the database yet**):\n\n"
                        .implode("\n", $previewLinesEn)
                        ."\n\n---\n⚠️ **Do you grant permission to post this update to the database?**\nClick **Approve & Post to Database** below (or reply `yes`) to commit, or `cancel` to abort.",
                    answerUr: "**{$existing->name}** میں درج ذیل تبدیلی ڈیٹا بیس میں محفوظ کرنے سے پہلے چیک کریں:\n\n"
                        .implode("\n", $previewLinesUr)
                        ."\n\n---\n⚠️ **کیا آپ یہ تبدیلی ڈیٹا بیس میں محفوظ کرنے کی اجازت دیتے ہیں؟**",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_permission' => true,
                        'preview_result' => [
                            'staged' => true,
                            'posted_to_database' => false,
                            'database_table' => $table,
                            'operation' => 'UPDATE',
                            'summary_en' => "1 {$labelEn} staged for UPDATE in `{$table}` table (Nothing written to database yet)",
                            'summary_ur' => "1 {$labelUr} اپڈیٹ کے لیے تیار ہے (ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا)",
                            'records' => [
                                [
                                    'title' => "{$existing->name} (ID #{$existing->id})",
                                    'status' => 'STAGED FOR UPDATE (NOT POSTED YET)',
                                    'fields' => $fieldsPreview,
                                ],
                            ],
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_awaiting_permission'
                );
            }

            // Confirmed -> Commit update to database
            if (! empty($taskData['new_name'])) {
                $existing->name = (string) $taskData['new_name'];
            }
            if (in_array($action, ['update_suppliers', 'update_customers'], true)) {
                if (isset($taskData['phone']) && $taskData['phone'] !== '') {
                    $existing->phone = (string) $taskData['phone'];
                }
                if (isset($taskData['email']) && $taskData['email'] !== '') {
                    $existing->email = (string) $taskData['email'];
                }
                if (isset($taskData['address']) && $taskData['address'] !== '') {
                    $existing->address = (string) $taskData['address'];
                }
                if (isset($taskData['credit_limit'])) {
                    $existing->credit_limit = (float) $taskData['credit_limit'];
                }
                if (isset($taskData['credit_days'])) {
                    $existing->credit_days = (int) $taskData['credit_days'];
                }
            }
            if (in_array($action, ['update_brands', 'update_suppliers'], true) && isset($taskData['expiry_return_months'])) {
                $existing->expiry_return_months = (int) $taskData['expiry_return_months'];
            }
            $existing->save();
            $this->clearPendingTask($user);

            return $this->formatTaskResponse(
                titleEn: "✅ {$labelEn} Updated in Database",
                titleUr: "✅ {$labelUr} کامیابی سے اپڈیٹ ہو گیا",
                answerEn: "✅ **Updated {$labelEn} in Database:** **{$existing->name}** (ID `#{$existing->id}`)",
                answerUr: "✅ **{$labelUr} اپڈیٹ ہو گیا:** **{$existing->name}** (ID `#{$existing->id}`)",
                links: [$link],
                taskMeta: [
                    'action' => $action,
                    'updated_count' => 1,
                    'result_summary' => [
                        'posted_to_database' => true,
                        'database_table' => $table,
                        'operation' => 'UPDATE',
                        'affected_count' => 1,
                        'records' => [
                            [
                                'id' => $existing->id,
                                'name' => $existing->name,
                                'changes' => array_map(fn ($fp) => "{$fp['field']}: {$fp['before']} → {$fp['after']}", $fieldsPreview),
                            ],
                        ],
                    ],
                ],
                productVersion: $productVersion,
                providerStatus: 'cube_task_executed'
            );
        }

        // =========================================================================
        // CREATE FLOW (Step-by-Step + Search Database First Before Creating New)
        // =========================================================================
        $name = trim((string) ($taskData['name'] ?? ''));

        // STEP 1: Ask for Product / Entity Name First if missing
        if ($name === '') {
            $taskData['step'] = 'ask_name';
            $this->savePendingTask($user, [
                'action' => $action,
                'awaiting_permission' => false,
                'payload' => $taskData,
            ]);

            if ($action === 'create_user_demands') {
                return $this->formatTaskResponse(
                    titleEn: '📝 Step 1 of 3 — Create User Demand: Which Product Does the Customer Need?',
                    titleUr: '📝 مرحلہ 1 از 3 — کسٹمر ڈیمانڈ: کس پروڈکٹ یا دوا کی ضرورت ہے؟',
                    answerEn: "🪜 **Step 1 of 3 — Enter Product / Medicine Name**\n"
                        ."Which **product or medicine** does the customer need?\n\n"
                        ."Please reply with the **product name** first — I will **search your database first** and show any matching products so you can select an existing item or record a new unlisted demand item.\n\n"
                        ."*Cancel anytime by typing `cancel`.*",
                    answerUr: "🪜 **مرحلہ 1 از 3 — پروڈکٹ یا دوا کا نام لکھیں**\n"
                        ."کسٹمر کو کون سی **پروڈکٹ یا دوا** درکار ہے؟\n\n"
                        ."براہِ کرم پہلے **پروڈکٹ کا نام** لکھیں — میں پہلے **ڈیٹا بیس میں تلاش کروں گا** اور ملتی جلتی پروڈکٹس دکھاؤں گا تاکہ آپ موجودہ پروڈکٹ منتخب کر سکیں یا نئی آئٹم درج کر سکیں۔",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 1,
                            'total' => 3,
                            'label_en' => 'Step 1 of 3: Enter Product Name to Search Database First',
                            'label_ur' => 'مرحلہ 1 از 3: ڈیٹا بیس میں تلاش کرنے کے لیے پروڈکٹ کا نام لکھیں',
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }

            return $this->formatTaskResponse(
                titleEn: "➕ Step 1 — Add New {$labelEn}: Enter {$labelEn} Name",
                titleUr: "➕ مرحلہ 1 — نیا {$labelUr}: نام درج کریں",
                answerEn: "🪜 **Step 1 — Enter {$labelEn} Name**\n"
                    ."Please reply with the **{$labelEn} name** first. I will **search your database first** to make sure a matching {$labelEn} does not already exist before creating a new one.\n\n"
                    ."*Cancel anytime by typing `cancel`.*",
                answerUr: "🪜 **مرحلہ 1 — {$labelUr} کا نام لکھیں**\n"
                    ."براہِ کرم پہلے **{$labelUr}** کا نام لکھیں۔ نیا ریکارڈ بنانے سے پہلے میں **ڈیٹا بیس میں چیک کروں گا** کہ یہ پہلے سے موجود تو نہیں۔",
                links: [$link],
                taskMeta: [
                    'action' => $action,
                    'awaiting_input' => true,
                    'step_info' => [
                        'current' => 1,
                        'total' => in_array($action, ['create_suppliers', 'create_customers'], true) ? 3 : 2,
                        'label_en' => "Step 1: Enter {$labelEn} Name (Searches DB First)",
                        'label_ur' => "مرحلہ 1: {$labelUr} کا نام لکھیں (پہلے ڈیٹا بیس میں تلاش کیا جائے گا)",
                    ],
                ],
                productVersion: $productVersion,
                providerStatus: 'cube_task_needs_input'
            );
        }

        // =========================================================================
        // SPECIAL STEP-BY-STEP FLOW FOR `create_user_demands`
        // =========================================================================
        if ($action === 'create_user_demands') {
            $hasSelectedDbProduct = ! empty($taskData['selected_product_id']);
            $hasConfirmedNewUnlisted = ! empty($taskData['confirmed_new_unlisted_item']);

            // STEP 2: Search `products` table in DB first before creating any new item!
            if (! $hasSelectedDbProduct && ! $hasConfirmedNewUnlisted) {
                $dbMatches = $this->searchMatchingProductsInDb($name, 6);

                if (! empty($dbMatches)) {
                    $taskData['step'] = 'select_product_or_new';
                    $taskData['db_matches'] = $dbMatches;
                    $this->savePendingTask($user, [
                        'action' => $action,
                        'awaiting_permission' => false,
                        'payload' => $taskData,
                    ]);

                    $matchLinesEn = [];
                    $matchLinesUr = [];
                    $stepChoices = [];

                    foreach ($dbMatches as $idx => $m) {
                        $num = $idx + 1;
                        $matchLinesEn[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_en']}";
                        $matchLinesUr[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_ur']}";

                        if ($idx < 4) {
                            $stepChoices[] = [
                                'label_en' => "✓ Select #{$num}: {$m['name']} (Stock: {$m['quantity']})",
                                'label_ur' => "✓ منتخب کریں #{$num}: {$m['name']} (اسٹاک: {$m['quantity']})",
                                'reply' => $m['select_reply'],
                                'variant' => 'primary',
                            ];
                        }
                    }

                    $stepChoices[] = [
                        'label_en' => "➕ Record \"{$name}\" as New Unlisted Item",
                        'label_ur' => "➕ \"{$name}\" نئی آئٹم کے طور پر درج کریں",
                        'reply' => 'Create new unlisted demand item',
                        'variant' => 'accent',
                    ];

                    $answerEn = "🔍 **Step 2 of 3 — Database Search Results for `\"{$name}\"`**\n\n"
                        ."I searched your `products` database first and found **".count($dbMatches)." matching product(s)**:\n\n"
                        .implode("\n", $matchLinesEn)."\n\n"
                        ."**Would you like to select an existing product from your database or record a new unlisted item?**\n"
                        ."- Click **\"✓ Select\"** on any matching database product below (or reply `1`, `2`, etc.), OR\n"
                        ."- Click **\"➕ Record as New Unlisted Item\"** if the customer is asking for a different unlisted item.";

                    $answerUr = "🔍 **مرحلہ 2 از 3 — ڈیٹا بیس میں `\"{$name}\"` کی تلاش کا نتیجہ**\n\n"
                        ."ڈیٹا بیس میں تلاش کرنے پر **".count($dbMatches)." ملتی جلتی پروڈکٹ(س)** پہلے سے موجود ملیں:\n\n"
                        .implode("\n", $matchLinesUr)."\n\n"
                        ."**کیا آپ ڈیٹا بیس سے موجودہ پروڈکٹ منتخب کرنا چاہتے ہیں یا نئی آئٹم درج کرنا چاہتے ہیں؟**\n"
                        ."- موجودہ پروڈکٹ منتخب کرنے کے لیے **\"✓ منتخب کریں\"** پر کلک کریں (یا `1`, `2` لکھیں)، یا\n"
                        ."- نئی آئٹم کے لیے **\"➕ نئی آئٹم کے طور پر درج کریں\"** پر کلک کریں۔";

                    return $this->formatTaskResponse(
                        titleEn: "🔍 Step 2 of 3 — Matching Product(s) Found in Database for \"{$name}\"",
                        titleUr: "🔍 مرحلہ 2 از 3 — ڈیٹا بیس میں \"{$name}\" سے ملتی جلتی پروڈکٹس ملیں",
                        answerEn: $answerEn,
                        answerUr: $answerUr,
                        links: [$link],
                        taskMeta: [
                            'action' => $action,
                            'awaiting_input' => true,
                            'step_info' => [
                                'current' => 2,
                                'total' => 3,
                                'label_en' => 'Step 2 of 3: Select Matching Product from DB or Create New',
                                'label_ur' => 'مرحلہ 2 از 3: ڈیٹا بیس سے موجودہ پروڈکٹ منتخب کریں یا نئی درج کریں',
                            ],
                            'db_matches' => $dbMatches,
                            'step_choices' => $stepChoices,
                        ],
                        productVersion: $productVersion,
                        providerStatus: 'cube_task_needs_input'
                    );
                }

                // 0 matches in DB -> Inform user that DB was searched and ask to confirm recording as new unlisted item (or search again)
                $taskData['step'] = 'confirm_unlisted_item';
                $taskData['db_matches'] = [];
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => false,
                    'payload' => $taskData,
                ]);

                $stepChoices = [
                    [
                        'label_en' => "➕ Record \"{$name}\" as New Unlisted Demand Item",
                        'label_ur' => "➕ \"{$name}\" نئی آئٹم کے طور پر ڈیمانڈ میں درج کریں",
                        'reply' => 'Create new unlisted demand item',
                        'variant' => 'primary',
                    ],
                ];

                $answerEn = "🔍 **Step 2 of 3 — Database Search Result for `\"{$name}\"`**\n\n"
                    ."I searched your `products` database first and found **no existing product matching `\"{$name}\"`**.\n\n"
                    ."**What would you like to do?**\n"
                    ."1. Click **\"➕ Record `{$name}` as New Unlisted Demand Item\"** below (or reply `create new` / `yes`) to log it as an unlisted customer demand without creating a duplicate catalog product, OR\n"
                    ."2. Type a **different product name** if you want me to search your database again.";

                $answerUr = "🔍 **مرحلہ 2 از 3 — ڈیٹا بیس میں `\"{$name}\"` کی تلاش کا نتیجہ**\n\n"
                    ."ڈیٹا بیس میں **`\"{$name}\"`** کے نام سے کوئی موجودہ پروڈکٹ نہیں ملی۔\n\n"
                    ."**آپ کیا کرنا چاہیں گے؟**\n"
                    ."1. اسے نئی ڈیمانڈ آئٹم کے طور پر درج کرنے کے لیے نیچے **\"➕ نئی آئٹم کے طور پر ڈیمانڈ میں درج کریں\"** پر کلک کریں، یا\n"
                    ."2. دوبارہ ڈیٹا بیس میں تلاش کرنے کے لیے **پروڈکٹ کا دوسرا نام** لکھیں۔";

                return $this->formatTaskResponse(
                    titleEn: "🔍 Step 2 of 3 — No Existing Product Matched \"{$name}\" in Database",
                    titleUr: "🔍 مرحلہ 2 از 3 — ڈیٹا بیس میں \"{$name}\" موجود نہیں ہے",
                    answerEn: $answerEn,
                    answerUr: $answerUr,
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 2,
                            'total' => 3,
                            'label_en' => 'Step 2 of 3: Confirm New Unlisted Item or Search Again',
                            'label_ur' => 'مرحلہ 2 از 3: نئی آئٹم کی تصدیق کریں یا دوبارہ تلاش کریں',
                        ],
                        'db_matches' => [],
                        'step_choices' => $stepChoices,
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }

            // STEP 3: Ask for Requested Quantity if not provided yet (never silently default to 1!)
            if (empty($taskData['requested_quantity'])) {
                $taskData['step'] = 'ask_quantity';
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => false,
                    'payload' => $taskData,
                ]);

                $selectedBadgeEn = $hasSelectedDbProduct
                    ? "✅ **Selected from Database:** **{$name}** (`".($taskData['selected_product_code'] ?? ('#'.$taskData['selected_product_id']))."`)"
                    : "➕ **Unlisted Demand Item:** **{$name}** *(No new product created in catalog)*";
                $selectedBadgeUr = $hasSelectedDbProduct
                    ? "✅ **ڈیٹا بیس سے منتخب شدہ:** **{$name}** (`".($taskData['selected_product_code'] ?? ('#'.$taskData['selected_product_id']))."`)"
                    : "➕ **نئی ڈیمانڈ آئٹم:** **{$name}**";

                $stepChoices = [
                    ['label_en' => 'Quantity: 1', 'label_ur' => 'تعداد: 1', 'reply' => 'quantity 1', 'variant' => 'primary'],
                    ['label_en' => 'Quantity: 2', 'label_ur' => 'تعداد: 2', 'reply' => 'quantity 2', 'variant' => 'secondary'],
                    ['label_en' => 'Quantity: 5', 'label_ur' => 'تعداد: 5', 'reply' => 'quantity 5', 'variant' => 'secondary'],
                    ['label_en' => 'Quantity: 10', 'label_ur' => 'تعداد: 10', 'reply' => 'quantity 10', 'variant' => 'secondary'],
                ];

                return $this->formatTaskResponse(
                    titleEn: "🔢 Step 3 of 3 — How Many Units/Packs of \"{$name}\" Are Needed?",
                    titleUr: "🔢 مرحلہ 3 از 3 — \"{$name}\" کی کتنی تعداد (Quantity) درکار ہے؟",
                    answerEn: "🪜 **Step 3 of 3 — Enter Requested Quantity**\n"
                        ."{$selectedBadgeEn}\n\n"
                        ."How many **packs/units** does the customer need? Click a quantity below or type the number (you can also include optional notes, e.g. `quantity 3, notes urgent`):",
                    answerUr: "🪜 **مرحلہ 3 از 3 — مطلوبہ تعداد (Quantity) بتائیں**\n"
                        ."{$selectedBadgeUr}\n\n"
                        ."کسٹمر کو کتنے **پیک/یونٹس** درکار ہیں؟ نیچے بٹن پر کلک کریں یا تعداد لکھیں:",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 3,
                            'total' => 3,
                            'label_en' => 'Step 3 of 3: Enter Requested Quantity & Optional Notes',
                            'label_ur' => 'مرحلہ 3 از 3: مطلوبہ تعداد (Quantity) درج کریں',
                        ],
                        'step_choices' => $stepChoices,
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }
        } else {
            // =========================================================================
            // STEP-BY-STEP & DB-FIRST FLOW FOR ALL OTHER MASTER ENTITIES
            // (`create_brands`, `create_categories`, `create_suppliers`, `create_customers`,
            //  `create_storage_locations`, `create_expense_categories`)
            // =========================================================================

            // Handle if the user chose "✓ Use Existing" from the DB matches step
            if (! empty($taskData['selected_existing_id'])) {
                $selId = (int) $taskData['selected_existing_id'];
                $selName = (string) ($taskData['selected_existing_name'] ?? $name);
                $this->clearPendingTask($user);

                return $this->formatTaskResponse(
                    titleEn: "✅ Selected Existing {$labelEn} from Database: {$selName}",
                    titleUr: "✅ ڈیٹا بیس سے موجودہ {$labelUr} منتخب کر لیا گیا: {$selName}",
                    answerEn: "✅ **Selected Existing {$labelEn} from Database (No Duplicate Created):**\n- **{$selName}** (ID `#{$selId}` in `{$table}`)",
                    answerUr: "✅ **ڈیٹا بیس سے موجودہ {$labelUr} منتخب کر لیا گیا (نیا ڈپلیکیٹ ریکارڈ نہیں بنایا گیا):**\n- **{$selName}** (ID `#{$selId}`)",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'status' => 'selected_existing',
                        'created_count' => 0,
                        'selected_existing' => [
                            'id' => $selId,
                            'name' => $selName,
                        ],
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_executed'
                );
            }

            // Handle if the user chose "✏️ Edit Existing" from the DB matches step
            if (! empty($taskData['switch_to_update_id'])) {
                $updateAction = str_replace('create_', 'update_', $action);
                if (in_array($updateAction, ['update_brands', 'update_categories', 'update_suppliers', 'update_customers'], true)) {
                    return $this->executeMasterEntityTask($user, $updateAction, [
                        'selected_existing_id' => (int) $taskData['switch_to_update_id'],
                        'target_name' => (string) ($taskData['switch_to_update_name'] ?? $name),
                    ], $productVersion, false);
                }
            }

            // STEP 2: Search target table in DB first before creating a new record!
            if (empty($taskData['confirmed_create_new'])) {
                $dbMatches = $this->searchMatchingMasterEntitiesInDb($action, $name, 6);
                if (! empty($dbMatches)) {
                    $taskData['step'] = 'resolve_db_matches';
                    $taskData['db_matches'] = $dbMatches;
                    $this->savePendingTask($user, [
                        'action' => $action,
                        'awaiting_permission' => false,
                        'payload' => $taskData,
                    ]);

                    $matchLinesEn = [];
                    $matchLinesUr = [];
                    $stepChoices = [];
                    $canUpdateEntity = in_array($action, ['create_brands', 'create_categories', 'create_suppliers', 'create_customers'], true);

                    foreach ($dbMatches as $idx => $m) {
                        $num = $idx + 1;
                        $matchLinesEn[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_en']}";
                        $matchLinesUr[] = "{$num}. **{$m['name']}** (`{$m['code']}`) — {$m['details_ur']}";

                        if ($idx < 3) {
                            $stepChoices[] = [
                                'label_en' => "✓ Use Existing: {$m['name']}",
                                'label_ur' => "✓ موجودہ استعمال کریں: {$m['name']}",
                                'reply' => $m['select_reply'],
                                'variant' => 'primary',
                            ];
                            if ($canUpdateEntity) {
                                $stepChoices[] = [
                                    'label_en' => "✏️ Edit Existing: {$m['name']}",
                                    'label_ur' => "✏️ موجودہ ایڈٹ کریں: {$m['name']}",
                                    'reply' => $m['edit_reply'],
                                    'variant' => 'secondary',
                                ];
                            }
                        }
                    }

                    $stepChoices[] = [
                        'label_en' => "➕ Create \"{$name}\" as New {$labelEn} Anyway",
                        'label_ur' => "➕ \"{$name}\" نیا {$labelUr} بنائیں",
                        'reply' => 'Create new anyway',
                        'variant' => 'accent',
                    ];

                    $answerEn = "🔍 **Step 2 — Matching {$labelEn}(s) Found in Database for `\"{$name}\"`**\n\n"
                        ."Before creating a new {$labelEn}, I searched your `{$table}` database and found **".count($dbMatches)." matching record(s)**:\n\n"
                        .implode("\n", $matchLinesEn)."\n\n"
                        ."**Would you like to select/edit an existing {$labelEn} or create a new one anyway?**\n"
                        ."- Click **\"✓ Use Existing\"** or **\"✏️ Edit Existing\"** below to avoid creating duplicates, OR\n"
                        ."- Click **\"➕ Create as New {$labelEn} Anyway\"** if this is a separate record.";

                    $answerUr = "🔍 **مرحلہ 2 — ڈیٹا بیس میں `\"{$name}\"` سے ملتا جلتا {$labelUr} موجود ہے**\n\n"
                        ."نیا ریکارڈ بنانے سے پہلے ڈیٹا بیس (`{$table}`) میں تلاش کرنے پر **".count($dbMatches)." ملتے جلتے ریکارڈ(ز)** ملے:\n\n"
                        .implode("\n", $matchLinesUr)."\n\n"
                        ."**آپ کیا کرنا چاہیں گے؟**\n"
                        ."- ڈپلیکیٹ سے بچنے کے لیے **\"✓ موجودہ استعمال کریں\"** یا **\"✏️ موجودہ ایڈٹ کریں\"** پر کلک کریں، یا\n"
                        ."- اگر واقعی نیا ریکارڈ بنانا ہے تو **\"➕ نیا {$labelUr} بنائیں\"** پر کلک کریں۔";

                    return $this->formatTaskResponse(
                        titleEn: "🔍 Matching {$labelEn}(s) Found in Database for \"{$name}\"",
                        titleUr: "🔍 ڈیٹا بیس میں \"{$name}\" سے ملتا جلتا {$labelUr} موجود ہے",
                        answerEn: $answerEn,
                        answerUr: $answerUr,
                        links: [$link],
                        taskMeta: [
                            'action' => $action,
                            'awaiting_input' => true,
                            'step_info' => [
                                'current' => 2,
                                'total' => in_array($action, ['create_suppliers', 'create_customers'], true) ? 3 : 2,
                                'label_en' => "Step 2: Select Existing {$labelEn} from DB or Confirm New",
                                'label_ur' => "مرحلہ 2: ڈیٹا بیس سے موجودہ {$labelUr} منتخب کریں یا نیا بنائیں",
                            ],
                            'db_matches' => $dbMatches,
                            'step_choices' => $stepChoices,
                        ],
                        productVersion: $productVersion,
                        providerStatus: 'cube_task_needs_input'
                    );
                }

                $taskData['confirmed_create_new'] = true;
            }

            // STEP 3 (For Suppliers & Customers): Ask for Phone & Address if not provided yet
            if (
                in_array($action, ['create_suppliers', 'create_customers'], true) &&
                empty($taskData['phone']) &&
                empty($taskData['address']) &&
                empty($taskData['contact_step_done'])
            ) {
                $taskData['step'] = 'ask_contact_details';
                $taskData['contact_step_done'] = true;
                $this->savePendingTask($user, [
                    'action' => $action,
                    'awaiting_permission' => false,
                    'payload' => $taskData,
                ]);

                $stepChoices = [
                    [
                        'label_en' => '⏭️ Skip Optional Details → Preview Result',
                        'label_ur' => '⏭️ اختیاری تفصیل چھوڑیں ← پری ویو دیکھیں',
                        'reply' => 'skip optional details',
                        'variant' => 'secondary',
                    ],
                ];

                return $this->formatTaskResponse(
                    titleEn: "📞 Step 2 of 3 — Contact Details for {$labelEn} \"{$name}\"",
                    titleUr: "📞 مرحلہ 2 از 3 — \"{$name}\" کا فون نمبر اور پتہ (اختیاری)",
                    answerEn: "🪜 **Step 2 of 3 — Phone Number & Address**\n"
                        ."✅ Checked database: No existing {$labelEn} matched **`\"{$name}\"`**.\n\n"
                        ."Please reply with the **Phone Number** and **Address** for **{$name}** (e.g., `phone 03001234567, address Lahore`), or click **\"⏭️ Skip Optional Details\"** below to proceed to the preview:",
                    answerUr: "🪜 **مرحلہ 2 از 3 — فون نمبر اور پتہ درج کریں**\n"
                        ."✅ ڈیٹا بیس چیک کر لیا گیا: **`\"{$name}\"`** کے نام سے پہلے کوئی ریکارڈ موجود نہیں ہے۔\n\n"
                        ."براہِ کرم **فون نمبر** اور **پتہ (Address)** لکھیں (مثلاً `phone 03001234567, address Lahore`)، یا پری ویو دیکھنے کے لیے نیچے **\"⏭️ اختیاری تفصیل چھوڑیں\"** پر کلک کریں:",
                    links: [$link],
                    taskMeta: [
                        'action' => $action,
                        'awaiting_input' => true,
                        'step_info' => [
                            'current' => 2,
                            'total' => 3,
                            'label_en' => "Step 2 of 3: Enter Phone & Address for {$name} (or Skip)",
                            'label_ur' => "مرحلہ 2 از 3: {$name} کا فون نمبر اور پتہ درج کریں",
                        ],
                        'step_choices' => $stepChoices,
                    ],
                    productVersion: $productVersion,
                    providerStatus: 'cube_task_needs_input'
                );
            }
        }

        $fieldsPreview = [
            ['field' => 'Name', 'before' => '— (New Record)', 'after' => $name],
        ];

        if (in_array($action, ['create_suppliers', 'create_customers'], true)) {
            $fieldsPreview[] = ['field' => 'Phone', 'before' => '—', 'after' => (string) ($taskData['phone'] ?? 'Not set')];
            $fieldsPreview[] = ['field' => 'Address', 'before' => '—', 'after' => (string) ($taskData['address'] ?? 'Not set')];
            if (isset($taskData['credit_limit'])) {
                $fieldsPreview[] = ['field' => 'Credit Limit', 'before' => '0.00', 'after' => number_format((float) $taskData['credit_limit'], 2)];
            }
        } elseif ($action === 'create_user_demands') {
            $qty = max(1, (int) ($taskData['requested_quantity'] ?? 1));
            $linkedProdInfo = ! empty($taskData['selected_product_id'])
                ? 'Existing DB Product #'.$taskData['selected_product_id'].(! empty($taskData['selected_product_code']) ? " ({$taskData['selected_product_code']})" : '')
                : 'New Unlisted Demand Item (No duplicate catalog product created)';
            $fieldsPreview[] = ['field' => 'Catalog Product Link', 'before' => '—', 'after' => $linkedProdInfo];
            $fieldsPreview[] = ['field' => 'Requested Quantity', 'before' => '—', 'after' => (string) $qty];
            $fieldsPreview[] = ['field' => 'Status', 'before' => '—', 'after' => 'pending'];
            if (! empty($taskData['notes'])) {
                $fieldsPreview[] = ['field' => 'Notes', 'before' => '—', 'after' => (string) $taskData['notes']];
            }
        } elseif ($action === 'create_storage_locations') {
            $code = strtoupper((string) ($taskData['code'] ?? ('LOC-'.strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'MAIN', 0, 4)))));
            $fieldsPreview[] = ['field' => 'Location Code', 'before' => '—', 'after' => $code];
            $fieldsPreview[] = ['field' => 'Default Rack', 'before' => '—', 'after' => (string) ($taskData['default_rack'] ?? 'R-01')];
        } elseif ($action === 'create_expense_categories') {
            $code = strtoupper((string) ($taskData['code'] ?? ('EXP-'.strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'GEN', 0, 4)))));
            $fieldsPreview[] = ['field' => 'Category Code', 'before' => '—', 'after' => $code];
            if (! empty($taskData['description'])) {
                $fieldsPreview[] = ['field' => 'Description', 'before' => '—', 'after' => (string) $taskData['description']];
            }
        }

        if (! $userConfirmed) {
            $this->savePendingTask($user, [
                'action' => $action,
                'awaiting_permission' => true,
                'payload' => $taskData,
            ]);

            $previewLinesEn = ["### ➕ New {$labelEn}: **{$name}**"];
            $previewLinesUr = ["### ➕ نیا {$labelUr}: **{$name}**"];
            foreach ($fieldsPreview as $fp) {
                $previewLinesEn[] = "- **{$fp['field']}:** `{$fp['after']}`";
                $previewLinesUr[] = "- **{$fp['field']}:** `{$fp['after']}`";
            }

            return $this->formatTaskResponse(
                titleEn: "🔐 Permission Required: Preview New {$labelEn} Before Saving",
                titleUr: "🔐 اجازت درکار ہے: نیا {$labelUr} محفوظ کرنے سے پہلے تصدیق کریں",
                answerEn: "Here is the exact **staged database result preview** for your new **{$labelEn}** (**not posted to the database yet**):\n\n"
                    .implode("\n", $previewLinesEn)
                    ."\n\n---\n⚠️ **Do you grant permission to post this {$labelEn} to the database?**\nClick **Approve & Post to Database** below (or reply `yes`) to commit, or `cancel` to abort.",
                answerUr: "نیا **{$labelUr}** ڈیٹا بیس میں شامل کرنے سے پہلے اس کی تفصیلات چیک کریں:\n\n"
                    .implode("\n", $previewLinesUr)
                    ."\n\n---\n⚠️ **کیا آپ اسے ڈیٹا بیس میں محفوظ کرنے کی اجازت دیتے ہیں؟**",
                links: [$link],
                taskMeta: [
                    'action' => $action,
                    'awaiting_permission' => true,
                    'preview_result' => [
                        'staged' => true,
                        'posted_to_database' => false,
                        'database_table' => $table,
                        'operation' => 'INSERT',
                        'summary_en' => "1 new {$labelEn} staged for INSERT into `{$table}` table (Nothing written to database yet)",
                        'summary_ur' => "1 نیا {$labelUr} ڈیٹا بیس میں شامل کرنے کے لیے تیار ہے (ابھی ڈیٹا بیس میں پوسٹ نہیں کیا گیا)",
                        'records' => [
                            [
                                'title' => $name,
                                'status' => 'STAGED FOR INSERT (NOT POSTED YET)',
                                'fields' => $fieldsPreview,
                            ],
                        ],
                    ],
                ],
                productVersion: $productVersion,
                providerStatus: 'cube_task_awaiting_permission'
            );
        }

        // Confirmed -> Commit INSERT to database
        $createdRecord = match ($action) {
            'create_brands' => Brand::firstOrCreate(
                ['name' => $name],
                [
                    'expiry_return_policy' => 'before_expiry',
                    'expiry_return_months' => isset($taskData['expiry_return_months']) ? (int) $taskData['expiry_return_months'] : 3,
                ]
            ),
            'create_categories' => Category::firstOrCreate(['name' => $name]),
            'create_suppliers' => Supplier::firstOrCreate(
                ['name' => $name],
                [
                    'phone' => $taskData['phone'] ?? null,
                    'email' => $taskData['email'] ?? null,
                    'address' => $taskData['address'] ?? null,
                    'credit_limit' => isset($taskData['credit_limit']) ? (float) $taskData['credit_limit'] : 0,
                    'credit_days' => isset($taskData['credit_days']) ? (int) $taskData['credit_days'] : 0,
                    'expiry_return_policy' => 'before_expiry',
                    'expiry_return_months' => isset($taskData['expiry_return_months']) ? (int) $taskData['expiry_return_months'] : 3,
                ]
            ),
            'create_customers' => Customer::firstOrCreate(
                ['name' => $name],
                [
                    'phone' => $taskData['phone'] ?? null,
                    'email' => $taskData['email'] ?? null,
                    'address' => $taskData['address'] ?? null,
                    'credit_limit' => isset($taskData['credit_limit']) ? (float) $taskData['credit_limit'] : 0,
                    'credit_days' => isset($taskData['credit_days']) ? (int) $taskData['credit_days'] : 0,
                ]
            ),
            'create_user_demands' => UserDemand::create([
                'product_id' => ! empty($taskData['selected_product_id'])
                    ? (int) $taskData['selected_product_id']
                    : null,
                'requested_by' => $user->id,
                'requested_name' => $name,
                'requested_quantity' => max(1, (int) ($taskData['requested_quantity'] ?? 1)),
                'notes' => $taskData['notes'] ?? 'Logged via Cube AI Assistant',
                'status' => 'pending',
            ]),
            'create_storage_locations' => StorageLocation::firstOrCreate(
                ['name' => $name],
                [
                    'code' => strtoupper((string) ($taskData['code'] ?? ('LOC-'.strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'MAIN', 0, 4)).'-'.random_int(10, 99)))),
                    'type' => 'rack',
                    'default_rack' => $taskData['default_rack'] ?? 'R-01',
                    'is_default' => false,
                    'is_active' => true,
                    'notes' => $taskData['notes'] ?? null,
                ]
            ),
            'create_expense_categories' => ExpenseCategory::firstOrCreate(
                ['name' => $name],
                [
                    'code' => strtoupper((string) ($taskData['code'] ?? ('EXP-'.strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'GEN', 0, 4)).'-'.random_int(10, 99)))),
                    'description' => $taskData['description'] ?? null,
                    'is_active' => true,
                ]
            ),
        };

        $this->clearPendingTask($user);

        return $this->formatTaskResponse(
            titleEn: "✅ {$labelEn} Created & Posted to Database",
            titleUr: "✅ نیا {$labelUr} کامیابی سے ڈیٹا بیس میں محفوظ ہو گیا",
            answerEn: "✅ **Posted to Database (`{$table}`):** **{$name}** (ID `#{$createdRecord->id}`)",
            answerUr: "✅ **ڈیٹا بیس میں محفوظ ہو گیا (`{$table}`):** **{$name}** (ID `#{$createdRecord->id}`)",
            links: [$link],
            taskMeta: [
                'action' => $action,
                'created_count' => 1,
                'result_summary' => [
                    'posted_to_database' => true,
                    'database_table' => $table,
                    'operation' => 'INSERT',
                    'affected_count' => 1,
                    'records' => [
                        [
                            'id' => $createdRecord->id,
                            'name' => $name,
                            'product_id' => $createdRecord->product_id ?? null,
                        ],
                    ],
                ],
            ],
            productVersion: $productVersion,
            providerStatus: 'cube_task_executed'
        );
    }

    /**
     * @param  array<int, array<string, string>>  $links
     * @param  array<string, mixed>  $taskMeta
     * @return array<string, mixed>
     */
    protected function formatTaskResponse(
        string $titleEn,
        string $titleUr,
        string $answerEn,
        string $answerUr,
        array $links,
        array $taskMeta,
        string $productVersion,
        string $providerStatus = 'cube_task_executed'
    ): array {
        return [
            'kind' => 'qa',
            'title_en' => $titleEn,
            'title_ur' => $titleUr,
            'answer_en' => $answerEn,
            'answer_ur' => $answerUr,
            'title' => [
                'en' => $titleEn,
                'ur' => $titleUr,
            ],
            'en' => $answerEn,
            'ur' => $answerUr,
            'source_ids' => ['task:'.($taskMeta['action'] ?? 'cube_automation')],
            'evidence_classification' => 'ai_grounded_docs',
            'evidence_badge' => [
                'en' => "⚡ Cube AI Task Automation • Non-Destructive (v{$productVersion})",
                'ur' => "⚡ کیوب اے آئی خودکار ٹاسک • محفوظ موڈ (v{$productVersion})",
            ],
            'provider' => 'cube_task_engine',
            'provider_status' => $providerStatus,
            'fallback_used' => false,
            'links' => $links,
            'workflow_id' => null,
            'task_meta' => $taskMeta,
            'background_task' => $taskMeta['background_task'] ?? null,
            'provider_trace' => [],
        ];
    }
}
