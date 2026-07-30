import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";

export default function TelaConfiguracoes({ filiais, centros, catalogo, onAbrir }) {
  const cartoes = [
    {
      id: "filiais",
      titulo: "Filiais",
      icone: "building",
      total: filiais.length,
      rotulo: filiais.length === 1 ? "filial" : "filiais",
      origem: "dbo.FILIAIS",
    },
    {
      id: "centros",
      titulo: "Centro de Custos",
      icone: "layers",
      total: centros.length,
      rotulo: centros.length === 1 ? "centro ativo" : "centros ativos",
      origem: "dbo.CTB_CENTRO_CUSTO",
    },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="Configurações"
        subtitulo="Cadastros lidos do ERP. Valem para todos os planos orçamentários."
      />

      <div className="grid-modulos grid-modulos--config">
        {cartoes.map((cartao) => (
          <button
            type="button"
            className="card-modulo card-modulo--config"
            key={cartao.id}
            onClick={() => onAbrir(cartao.id)}
          >
            <span className="card-modulo__icone">
              <Icone nome={cartao.icone} tamanho={23} />
            </span>
            <span className="card-modulo__texto">
              <strong>{cartao.titulo}</strong>
              <small>
                {cartao.total} {cartao.rotulo} · {cartao.origem}
              </small>
            </span>
            <Icone nome="chevron" tamanho={17} />
          </button>
        ))}
      </div>

      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        Estes cadastros são somente leitura: quem manda neles é o ERP. O plano de contas usado nas
        visões tem {catalogo.lista.length} classificações e vem da mesma origem.
      </p>
    </main>
  );
}
