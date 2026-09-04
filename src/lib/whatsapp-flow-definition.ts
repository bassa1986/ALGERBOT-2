// Flow JSON for a full WhatsApp order: pick a product, enter delivery
// details, confirm. This is the JSON to paste into Meta's Flow Builder
// (or publish via the Cloud API) -- it is NOT sent by this app at
// runtime; runtime data (products, wilayas, delivery-zone check) comes
// from the Data Endpoint (src/routes/api/whatsapp/flow-endpoint.ts) via
// each screen's `data` schema.
//
// Screens:
//   PRODUCT_LIST -- RadioButtonsGroup of this store's products (populated
//     on INIT). Buyer picks one, taps Continue -> data_exchange to fetch
//     that product's variants (if any).
//   PRODUCT_DETAILS -- quantity (Dropdown 1-10) and, if the product has
//     variants, a RadioButtonsGroup to pick one. Continue -> data_exchange
//     to fetch the wilaya list.
//   DELIVERY_INFO -- buyer name, phone, wilaya (Dropdown, populated by
//     the endpoint), commune (free text), address, optional notes.
//   REVIEW -- shows a computed summary (subtotal/delivery fee/total, from
//     the endpoint, never trusted from the client) and a Confirm footer
//     that completes the Flow. The webhook then calls the SAME
//     createOrder() function the web checkout uses -- full stock/price
//     re-validation, never trusting anything the Flow submitted as final.
export const ORDER_FLOW_JSON = {
  version: '7.0',
  data_api_version: '3.0',
  routing_model: {
    PRODUCT_LIST: ['PRODUCT_DETAILS'],
    PRODUCT_DETAILS: ['DELIVERY_INFO'],
    DELIVERY_INFO: ['REVIEW'],
    REVIEW: [],
  },
  screens: [
    {
      id: 'PRODUCT_LIST',
      title: 'Nos produits',
      data: {
        store_name: { type: 'string' },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } },
          },
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.store_name}' },
          {
            type: 'Form',
            name: 'product_form',
            children: [
              {
                type: 'RadioButtonsGroup',
                name: 'selected_product',
                label: 'Choisissez un produit',
                required: true,
                'data-source': '${data.products}',
              },
              {
                type: 'Footer',
                label: 'Continuer',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: { selected_product: '${form.selected_product}' },
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'PRODUCT_DETAILS',
      title: 'Détails',
      data: {
        product_name: { type: 'string' },
        unit_price_label: { type: 'string' },
        has_variants: { type: 'boolean' },
        variants: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
        quantities: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.product_name}' },
          { type: 'TextBody', text: '${data.unit_price_label}' },
          {
            type: 'Form',
            name: 'details_form',
            children: [
              {
                type: 'RadioButtonsGroup',
                name: 'selected_variant',
                label: 'Choisissez une option',
                required: true,
                'data-source': '${data.variants}',
                visible: '${data.has_variants}',
              },
              {
                type: 'Dropdown',
                name: 'quantity',
                label: 'Quantité',
                required: true,
                'data-source': '${data.quantities}',
              },
              {
                type: 'Footer',
                label: 'Continuer',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: {
                    selected_variant: '${form.selected_variant}',
                    quantity: '${form.quantity}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'DELIVERY_INFO',
      title: 'Livraison',
      data: {
        wilayas: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'delivery_form',
            children: [
              { type: 'TextInput', name: 'buyer_name', label: 'Nom complet', required: true, 'input-type': 'text' },
              { type: 'TextInput', name: 'buyer_phone', label: 'Téléphone', required: true, 'input-type': 'phone' },
              {
                type: 'Dropdown',
                name: 'wilaya_code',
                label: 'Wilaya',
                required: true,
                'data-source': '${data.wilayas}',
              },
              {
                type: 'TextInput',
                name: 'commune',
                label: 'Commune',
                required: true,
                'input-type': 'text',
                'helper-text': 'Écrivez le nom de votre commune',
              },
              {
                type: 'TextArea',
                name: 'address',
                label: 'Adresse complète',
                required: true,
              },
              {
                type: 'TextArea',
                name: 'notes',
                label: 'Remarques (optionnel)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Voir le récapitulatif',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: {
                    buyer_name: '${form.buyer_name}',
                    buyer_phone: '${form.buyer_phone}',
                    wilaya_code: '${form.wilaya_code}',
                    commune: '${form.commune}',
                    address: '${form.address}',
                    notes: '${form.notes}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'REVIEW',
      title: 'Récapitulatif',
      terminal: true,
      data: {
        summary_text: { type: 'string' },
        can_deliver: { type: 'boolean' },
        error_text: { type: 'string' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextBody', text: '${data.summary_text}' },
          { type: 'TextBody', text: '${data.error_text}', visible: '${!data.can_deliver}' },
          {
            type: 'Footer',
            label: 'Confirmer la commande',
            enabled: '${data.can_deliver}',
            'on-click-action': {
              name: 'complete',
              payload: {},
            },
          },
        ],
      },
    },
  ],
}
